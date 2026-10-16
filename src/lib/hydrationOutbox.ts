// The hydration outbox: every cup added or removed on this device, kept until
// the server has acknowledged it.
//
// A day's cloud record is a running total that every change increments, so
// changes made on several devices, or in several tabs, add up instead of the
// last writer's count replacing the others'. An increment queued offline lives
// only in the tab's memory (Firestore runs on its memory cache here), so each
// change is also stored here, and any page delivers it if the page that made
// it closes first. Three rules keep that from counting a cup twice:
//
//  - Each change has its own localStorage key, so recording and settling never
//    read-modify-write a value another tab is writing.
//  - Each change has its own Web Lock. A page holds it while the change is
//    stored and while the page is sending it — until the server acknowledges
//    it — and releases it once a change that waits for a flush is stored. A
//    page that closes releases its locks when its queued writes die, so a
//    change whose lock is free is one nobody is sending.
//  - Each write carries a receipt (`ops.{id}`), and a change a page didn't just
//    send is only ever delivered by `recover`: one transaction that reads the
//    day from the server and writes nothing if the receipt is there — the write
//    landed and only its acknowledgement was lost. A transaction, because a
//    plain read can be answered by an open listener's view, which can lag the
//    write it is meant to find; and because a write landing between a separate
//    read and the resend would still be counted twice.
//
// A change this page can't store (no Web Locks, storage full or blocked) is
// kept in this page's memory instead, and the next flush delivers it. Nobody
// else knows of it, so it is lost if the page closes first.
//
// A page's own changes to a day reach the server in the order it made them: a
// removal that overtakes the cup it removes clamps at 0 and is lost. Changes
// the page sends go through the SDK's queue, in order. One made while the page
// has changes waiting for a flush waits behind them; and a flush leaves a day
// alone while the page is still sending to it, or while another page is
// delivering one of its changes to it. Between pages there is no order.
//
// A neutral lib: the transport is passed in, so it imports no feature.

export type HydrationTransport = {
  /** Add `delta` to `day`'s count, with `id`'s receipt in the same write. Queues offline. */
  send: (email: string, day: string, delta: number, id: string) => Promise<void>;
  /**
   * The same, in a transaction that reads the day from the server first and
   * writes nothing when `id`'s receipt is already there. Fails offline.
   */
  recover: (email: string, day: string, delta: number, id: string) => Promise<void>;
};

type Entry = { day: string; delta: number; at: number };
type Held = { id: string; entry: Entry; stored: boolean; release: () => void };

const PREFIX = "bookmarkdeck:focus:hydration-outbox:v1";
const LOCK = "bookmarkdeck:hydration-op";
// A device that never syncs keeps its newest changes, not every change for ever.
const MAX_ENTRIES = 500;
// After a flush that couldn't deliver something, how long until a retry is due.
const FIRST_RETRY_MS = 15_000;
const MAX_RETRY_MS = 5 * 60_000;

const keyPrefix = (email: string) => `${PREFIX}:${email}:`;
const lockName = (id: string) => `${LOCK}:${id}`;

function lockManager(): LockManager | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as { locks?: LockManager }).locks ?? null;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

// Changes are ordered by when they were made. Within a page that order must be
// exact: two changes in one millisecond, or a clock stepped back between them,
// would otherwise sort either way.
let lastAt = 0;
function stamp(): number {
  lastAt = Math.max(Date.now(), lastAt + 1);
  return lastAt;
}

function parse(raw: string | null): Entry | null {
  try {
    const e: unknown = raw ? JSON.parse(raw) : null;
    if (!e || typeof e !== "object") return null;
    const { day, delta, at } = e as Record<string, unknown>;
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    if (!Number.isInteger(delta) || delta === 0 || typeof at !== "number") return null;
    return { day, delta: delta as number, at };
  } catch {
    return null;
  }
}

/** This account's stored changes. Records that can't be read are removed. */
function stored(email: string): { id: string; entry: Entry }[] {
  const prefix = keyPrefix(email);
  const out: { id: string; entry: Entry }[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix) && !k.slice(prefix.length).includes(":")) keys.push(k);
    }
    for (const k of keys) {
      const entry = parse(localStorage.getItem(k));
      if (entry) out.push({ id: k.slice(prefix.length), entry });
      else localStorage.removeItem(k);
    }
  } catch {
    // Storage unavailable: nothing stored.
  }
  return out;
}

function read(email: string, id: string): Entry | null {
  try {
    return parse(localStorage.getItem(keyPrefix(email) + id));
  } catch {
    return null;
  }
}

/** Store a change; only once it is stored are the oldest beyond the cap dropped. */
function store(email: string, id: string, entry: Entry): boolean {
  try {
    localStorage.setItem(keyPrefix(email) + id, JSON.stringify(entry));
  } catch {
    return false;
  }
  const others = stored(email)
    .filter((s) => s.id !== id)
    .sort((a, b) => a.entry.at - b.entry.at);
  for (const old of others.slice(0, Math.max(0, others.length + 1 - MAX_ENTRIES))) {
    forget(email, old.id);
  }
  return true;
}

function forget(email: string, id: string) {
  ours.delete(id);
  try {
    localStorage.removeItem(keyPrefix(email) + id);
  } catch {
    // Nothing to remove.
  }
}

// The changes this page made and hasn't seen delivered. `sending`: on its way
// through the SDK, unacknowledged. Otherwise it waits for a flush. `stored`:
// whether it is in localStorage, where another page can deliver it.
type Ours = { email: string; day: string; sending: boolean; stored: boolean };
const ours = new Map<string, Ours>();

// Changes this page couldn't store, for its next flush.
const unsent: { email: string; id: string; entry: Entry }[] = [];

/** Whether this page has sent a change the server hasn't acknowledged yet. */
export function hydrationInFlight(): boolean {
  return [...ours.values()].some((o) => o.sending);
}

/** This page's changes to `day` that wait for a flush, dropping any another page has delivered. */
function oursWaiting(email: string, day: string): string[] {
  const ids: string[] = [];
  for (const [id, o] of ours) {
    if (o.email !== email || o.day !== day || o.sending) continue;
    if (o.stored && !read(email, id)) ours.delete(id);
    else ids.push(id);
  }
  return ids;
}

/**
 * Whether `day` has changes this page can't yet count as on the server: its
 * own waiting for a flush, or any stored by a page that isn't sending them.
 */
export function hydrationWaiting(email: string, day: string): boolean {
  if (oursWaiting(email, day).length) return true;
  return stored(email).some((s) => s.entry.day === day && !ours.get(s.id)?.sending);
}

// A page restored from the back/forward cache may have lost its locks while it
// was frozen, and another page may have delivered its stored changes since. Its
// own queued writes would then land a second time, so it reloads instead — but
// only when every change it holds is stored: a reload loses one held only here.
// Chromium never restores a page holding a Web Lock, so there this never fires.
let restoreGuarded = false;
function guardRestore() {
  if (restoreGuarded || typeof window === "undefined") return;
  restoreGuarded = true;
  window.addEventListener("pageshow", (e) => {
    if (!(e as PageTransitionEvent).persisted) return;
    const held = [...ours.values()];
    if (held.some((o) => o.sending) && held.every((o) => o.stored)) window.location.reload();
  });
}

/** Send one change; true once acknowledged, false if refused. */
async function sendNow(
  email: string,
  id: string,
  entry: Entry,
  transport: HydrationTransport
): Promise<boolean> {
  try {
    await transport.send(email, entry.day, entry.delta, id);
    ours.delete(id);
    return true;
  } catch {
    const o = ours.get(id);
    if (o) o.sending = false;
    return false;
  }
}

/**
 * Record a change of `delta` cups to `day`. With `send`, it goes to the server
 * at once, through the SDK's queue — unless this page has changes to the day
 * waiting for a flush, when it waits behind them. Without `send` (not
 * connected) it waits for a flush. It is stored until it is acknowledged, so a
 * page that closes first doesn't lose it; one that can't be stored is kept in
 * this page only.
 */
export function recordHydration(
  email: string,
  day: string,
  delta: number,
  { send }: { send: boolean },
  transport: HydrationTransport
): void {
  if (!delta) return;
  const id = newId();
  const entry: Entry = { day, delta, at: stamp() };
  const locks = lockManager();
  const behind = send && oursWaiting(email, day).length > 0;
  const mine: Ours = { email, day, sending: send && !behind, stored: false };
  ours.set(id, mine);
  if (mine.sending && locks) guardRestore();
  const sending = mine.sending ? sendNow(email, id, entry, transport) : null;
  const keepHere = () => {
    if (!sending) unsent.push({ email, id, entry });
    else
      void sending.then((ok) => {
        if (!ok) unsent.push({ email, id, entry });
      });
  };
  // Once it is stored (or kept here) and its lock released, so a flush can take it.
  const followOn = () => {
    if (behind) void flush(email, transport, locks);
  };
  if (!locks) {
    keepHere();
    return followOn();
  }
  let ran = false;
  try {
    // Stored only once its lock is held: until then no other page can find
    // it, so none can find it unclaimed.
    locks
      .request(lockName(id), async () => {
        ran = true;
        if (!store(email, id, entry)) return keepHere();
        mine.stored = true;
        if (sending && (await sending)) forget(email, id);
        // Refused, or not sent: it stays stored, for a flush to deliver.
      })
      .catch(() => {
        if (!ran) keepHere();
      })
      .finally(followOn);
  } catch {
    keepHere();
    followOn();
  }
}

/** Claim a change's lock if no page holds it. */
function claim(locks: LockManager, id: string): Promise<(() => void) | null> {
  return new Promise((resolve) => {
    try {
      locks
        .request(lockName(id), { ifAvailable: true }, (lock) => {
          if (!lock) return resolve(null);
          return new Promise<void>((release) => resolve(release));
        })
        .catch(() => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * One day's changes, in the order they were made — a removal applied before
 * the cup it removes clamps at 0 and is lost — one at a time, stopping at the
 * first that fails (offline), so none overtakes an earlier one. True if all
 * were delivered.
 */
async function recoverDay(email: string, held: Held[], transport: HydrationTransport) {
  held.sort((a, b) => a.entry.at - b.entry.at);
  let failed = false;
  for (const h of held) {
    if (!failed) {
      try {
        await transport.recover(email, h.entry.day, h.entry.delta, h.id);
        if (h.stored) forget(email, h.id);
        else ours.delete(h.id);
      } catch {
        failed = true;
      }
    }
    if (failed) putBack(email, h);
    h.release();
  }
  return !failed;
}

/** A change this flush holds but doesn't deliver: one held only here goes back. */
function putBack(email: string, h: Held) {
  if (!h.stored) unsent.push({ email, id: h.id, entry: h.entry });
}

/**
 * Whether a flush holding `held` may deliver `day` now. Not while this page is
 * still sending to the day — the SDK may not have delivered it yet — nor while
 * one of this page's changes to the day is out of the flush's hands (another
 * page is delivering it): either would let a later change overtake it.
 */
function ready(email: string, day: string, held: Held[]): boolean {
  for (const o of ours.values()) {
    if (o.email === email && o.day === day && o.sending) return false;
  }
  return oursWaiting(email, day).every((id) => held.some((h) => h.id === id));
}

// After a flush that left changes undelivered, when this page should try again:
// sooner after one that only waited for a day, backing off after failures.
const retries = new Map<string, { due: number; wait: number }>();

/**
 * Whether a flush of this account is due again: the last one left changes it
 * couldn't deliver yet. Pages flush on events (the server's first answer, the
 * network coming back, focus); this is for a page left open with neither.
 */
export function hydrationRetryDue(email: string): boolean {
  const r = retries.get(email);
  return r !== undefined && Date.now() >= r.due;
}

// One flush at a time per account in this page, so a day's changes go out in
// the order they were made: two at once could each hold some of a day's
// changes. A flush asked for while one runs becomes one that starts after it,
// and any asked for while that one waits share it.
const flushes = new Map<string, { last: Promise<void>; waiting: boolean }>();

/**
 * Deliver every change no live page is sending: those stored by any page, and
 * those only this page holds. Safe to call any number of times, from any
 * number of pages — each stored change is recovered by whichever page holds
 * its lock, and recovery writes nothing the server already has.
 */
export function flushHydration(email: string, transport: HydrationTransport): Promise<void> {
  return flush(email, transport, lockManager());
}

function flush(
  email: string,
  transport: HydrationTransport,
  locks: LockManager | null
): Promise<void> {
  const slot = flushes.get(email);
  if (slot?.waiting) return slot.last;
  const next = { last: Promise.resolve(), waiting: Boolean(slot) };
  next.last = slot
    ? slot.last.then(() => {
        next.waiting = false;
        return flushOnce(email, transport, locks);
      })
    : flushOnce(email, transport, locks);
  flushes.set(email, next);
  void next.last.finally(() => {
    if (flushes.get(email) === next) flushes.delete(email);
  });
  return next.last;
}

async function flushOnce(
  email: string,
  transport: HydrationTransport,
  locks: LockManager | null
): Promise<void> {
  const held: Held[] = [];
  for (let i = 0; i < unsent.length; ) {
    if (unsent[i].email !== email) {
      i++;
      continue;
    }
    const [u] = unsent.splice(i, 1);
    held.push({ id: u.id, entry: u.entry, stored: false, release: () => {} });
  }
  if (locks) {
    const ids = stored(email).map((s) => s.id);
    const claims = await Promise.all(ids.map((id) => claim(locks, id)));
    ids.forEach((id, i) => {
      const release = claims[i];
      if (!release) return; // a live page is sending it
      // Read again under the lock: the page that held it may have settled it.
      const entry = read(email, id);
      if (!entry) {
        ours.delete(id);
        return release();
      }
      held.push({ id, entry, stored: true, release });
    });
  }
  const byDay = new Map<string, Held[]>();
  for (const h of held) byDay.set(h.entry.day, [...(byDay.get(h.entry.day) ?? []), h]);
  let deferred = false;
  const results = await Promise.all(
    [...byDay].map(([day, dayHeld]) => {
      if (ready(email, day, dayHeld)) return recoverDay(email, dayHeld, transport);
      deferred = true;
      for (const h of dayHeld) {
        putBack(email, h);
        h.release();
      }
      return true;
    })
  );
  const wait = retries.get(email)?.wait ?? 0;
  if (results.includes(false)) {
    const next = Math.min(MAX_RETRY_MS, wait ? wait * 2 : FIRST_RETRY_MS);
    retries.set(email, { due: Date.now() + next, wait: next });
  } else if (deferred) retries.set(email, { due: Date.now(), wait });
  else retries.delete(email);
}
