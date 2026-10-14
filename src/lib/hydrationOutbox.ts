// The hydration outbox: every cup added or removed on this device, kept until
// the server has acknowledged it.
//
// A day's cloud record is a running total that every change increments, so
// changes made on several devices, or in several tabs, add up instead of the
// last writer's count replacing the others'. An increment queued offline lives
// only in the tab's memory (Firestore runs on its memory cache here), so each
// change is also stored here, and any page sends it if the page that made it
// closes first. Three rules keep that from counting a cup twice:
//
//  - Each change has its own localStorage key, so recording and settling never
//    read-modify-write a value another tab is writing.
//  - Each change has its own Web Lock, held by the page that made it from the
//    moment it is stored until the server acknowledges it. A page that closes
//    releases its locks when its queued writes die, so a change whose lock is
//    free is one nobody is sending.
//  - Each write carries a receipt (`ops.{id}`), and a change a page didn't just
//    make is only ever sent again by `recover`: one transaction that reads the
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
  try {
    localStorage.removeItem(keyPrefix(email) + id);
  } catch {
    // Nothing to remove.
  }
}

let inFlight = 0;
let restoreGuarded = false;
// Changes this page has sent and the server hasn't acknowledged.
const sendingIds = new Set<string>();

/** Whether this page has sent a change the server hasn't acknowledged yet. */
export function hydrationInFlight(): boolean {
  return inFlight > 0;
}

// A page restored from the back/forward cache may have lost its locks while it
// was frozen, and another page may have recovered its stored changes since.
// Its own queued writes would then land a second time, so it reloads instead.
// Only with Web Locks: without them nothing is stored, and a reload would lose
// what only this page holds.
function guardRestore() {
  if (restoreGuarded || typeof window === "undefined") return;
  restoreGuarded = true;
  window.addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted && inFlight > 0) window.location.reload();
  });
}

/** Send one change; true once acknowledged, false if refused. */
async function sendNow(
  email: string,
  id: string,
  entry: Entry,
  transport: HydrationTransport,
  guarded: boolean
): Promise<boolean> {
  inFlight++;
  sendingIds.add(id);
  if (guarded) guardRestore();
  try {
    await transport.send(email, entry.day, entry.delta, id);
    return true;
  } catch {
    return false;
  } finally {
    inFlight--;
    sendingIds.delete(id);
  }
}

// Changes this page couldn't store, for its next flush.
const unsent: { email: string; id: string; entry: Entry }[] = [];

/** Whether `day` has changes waiting for a flush: stored, and not being sent by this page. */
function waiting(email: string, day: string): boolean {
  if (unsent.some((u) => u.email === email && u.entry.day === day)) return true;
  return stored(email).some((s) => s.entry.day === day && !sendingIds.has(s.id));
}

/**
 * Record a change of `delta` cups to `day`. With `send`, it goes to the server
 * at once, so this page's changes land in the order they were made — unless
 * the day has changes still waiting for a flush, when it waits behind them: a
 * removal sent ahead of the cup it removes reaches 0, is clamped there, and
 * the day ends one high. Without `send` (not connected) it waits for a flush.
 * Either way it is stored until acknowledged, so a page that closes first
 * doesn't lose it.
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
  const entry: Entry = { day, delta, at: Date.now() };
  const locks = lockManager();
  const behind = send && waiting(email, day);
  const sending = send && !behind ? sendNow(email, id, entry, transport, locks !== null) : null;
  const keepHere = () => {
    if (!sending) unsent.push({ email, id, entry });
    else
      void sending.then((ok) => {
        if (!ok) unsent.push({ email, id, entry });
      });
  };
  // Once it is stored (or kept here) and its lock released, so a flush can take it.
  const followOn = () => {
    if (behind) void flushHydration(email, transport);
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
        if (sending && (await sending)) forget(email, id);
        // Refused, or not sent: it stays stored, for a flush to recover.
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
    locks
      .request(lockName(id), { ifAvailable: true }, (lock) => {
        if (!lock) return resolve(null);
        return new Promise<void>((release) => resolve(release));
      })
      .catch(() => resolve(null));
  });
}

/**
 * One day's changes, in the order they were made — a removal applied before
 * the cup it removes clamps at 0 and is lost — one at a time, stopping at the
 * first that fails (offline), so none overtakes an earlier one.
 */
async function recoverDay(email: string, held: Held[], transport: HydrationTransport) {
  held.sort((a, b) => a.entry.at - b.entry.at);
  let failed = false;
  for (const h of held) {
    if (!failed) {
      try {
        await transport.recover(email, h.entry.day, h.entry.delta, h.id);
        if (h.stored) forget(email, h.id);
      } catch {
        failed = true;
      }
    }
    if (failed && !h.stored) unsent.push({ email, id: h.id, entry: h.entry });
    h.release();
  }
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
  const slot = flushes.get(email);
  if (slot?.waiting) return slot.last;
  const mine = { last: Promise.resolve(), waiting: Boolean(slot) };
  mine.last = slot
    ? slot.last.then(() => {
        mine.waiting = false;
        return flushOnce(email, transport);
      })
    : flushOnce(email, transport);
  flushes.set(email, mine);
  void mine.last.finally(() => {
    if (flushes.get(email) === mine) flushes.delete(email);
  });
  return mine.last;
}

async function flushOnce(email: string, transport: HydrationTransport): Promise<void> {
  const held: Held[] = [];
  for (let i = unsent.length - 1; i >= 0; i--) {
    if (unsent[i].email !== email) continue;
    const [u] = unsent.splice(i, 1);
    held.push({ id: u.id, entry: u.entry, stored: false, release: () => {} });
  }
  const locks = lockManager();
  if (locks) {
    const ids = stored(email).map((s) => s.id);
    const claims = await Promise.all(ids.map((id) => claim(locks, id)));
    ids.forEach((id, i) => {
      const release = claims[i];
      if (!release) return; // a live page is sending it
      // Read again under the lock: the page that held it may have settled it.
      const entry = read(email, id);
      if (!entry) return release();
      held.push({ id, entry, stored: true, release });
    });
  }
  const byDay = new Map<string, Held[]>();
  for (const h of held) byDay.set(h.entry.day, [...(byDay.get(h.entry.day) ?? []), h]);
  await Promise.all([...byDay.values()].map((day) => recoverDay(email, day, transport)));
}
