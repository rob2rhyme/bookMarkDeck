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
//  - Each change has its own Web Lock, held by the page sending it from the
//    moment the change is stored until the server acknowledges it. A page that
//    closes releases its locks exactly when its queued writes die, so a change
//    whose lock is free is one nobody is sending.
//  - Each write carries a receipt (`ops.{id}`) in the same atomic write, and a
//    page about to resend a change it didn't just make reads the day from the
//    server first. A receipt means the write landed and only its acknowledgement
//    was lost, so the change is settled instead of sent again.
//
// Without Web Locks (an insecure context, Safari before 15.4) no page can tell
// whether another is still sending a stored change, so nothing is stored for
// another page to find: a change is sent at once, or kept in this page's memory
// until a flush, and is lost if the page closes first.
//
// A neutral lib: the transport is passed in, so it imports no feature.

export type HydrationTransport = {
  /** Add `delta` to `day`'s count, with `id`'s receipt in the same write. */
  send: (email: string, day: string, delta: number, id: string) => Promise<void>;
  /** The ids whose receipts `day`'s record holds, read from the server. */
  receipts: (email: string, day: string) => Promise<Iterable<string>>;
};

type Entry = { day: string; delta: number; at: number };
type Held = { id: string; entry: Entry; release: () => void };

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

function store(email: string, id: string, entry: Entry): boolean {
  try {
    const all = stored(email).sort((a, b) => a.entry.at - b.entry.at);
    for (const old of all.slice(0, Math.max(0, all.length + 1 - MAX_ENTRIES))) {
      localStorage.removeItem(keyPrefix(email) + old.id);
    }
    localStorage.setItem(keyPrefix(email) + id, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
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

/** Whether this page has sent a change the server hasn't acknowledged yet. */
export function hydrationInFlight(): boolean {
  return inFlight > 0;
}

// A page restored from the back/forward cache may have lost its locks while it
// was frozen, and another page may have sent its changes since. Reloading drops
// this page's copies of them rather than sending them a second time.
function guardRestore() {
  if (restoreGuarded || typeof window === "undefined") return;
  restoreGuarded = true;
  window.addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted && inFlight > 0) window.location.reload();
  });
}

/** Send one change; settled (removed) once acknowledged, kept if refused. */
async function deliver(
  email: string,
  id: string,
  entry: Entry,
  transport: HydrationTransport
): Promise<boolean> {
  inFlight++;
  guardRestore();
  try {
    await transport.send(email, entry.day, entry.delta, id);
    forget(email, id);
    return true;
  } catch {
    return false;
  } finally {
    inFlight--;
  }
}

// Changes kept in this page's memory, when there are no Web Locks.
const unsent: { email: string; id: string; entry: Entry }[] = [];

/**
 * Record a change of `delta` cups to `day`. With `send`, it goes to the server
 * now; without (not connected), it waits for a flush. Either way it is stored
 * until acknowledged, so a page that closes first doesn't lose it.
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
  const keep = () => {
    if (send) {
      void deliver(email, id, entry, transport).then((ok) => {
        if (!ok) unsent.push({ email, id, entry });
      });
    } else {
      unsent.push({ email, id, entry });
    }
  };
  const locks = lockManager();
  if (!locks) return keep();
  let ran = false;
  // Stored only once its lock is held: until then no other page can find it,
  // so none can find it unclaimed.
  locks
    .request(lockName(id), async () => {
      ran = true;
      store(email, id, entry);
      if (send) await deliver(email, id, entry, transport);
    })
    .catch(() => {
      if (!ran) keep();
    });
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

async function flushDay(
  email: string,
  day: string,
  held: Held[],
  transport: HydrationTransport
): Promise<void> {
  let landed: Set<string>;
  try {
    landed = new Set(await transport.receipts(email, day));
  } catch {
    held.forEach((h) => h.release()); // offline: kept for the next flush
    return;
  }
  // In the order they were made: a removal applied before the cup it removes
  // clamps at 0 and is lost.
  held.sort((a, b) => a.entry.at - b.entry.at);
  await Promise.all(
    held.map(async (h) => {
      if (landed.has(h.id)) forget(email, h.id);
      else await deliver(email, h.id, h.entry, transport);
      h.release();
    })
  );
}

/**
 * Send every stored change no live page is sending. Safe to call any number of
 * times, from any number of pages: each change is sent by whichever page holds
 * its lock, after checking the server doesn't already have it.
 */
export async function flushHydration(email: string, transport: HydrationTransport): Promise<void> {
  const locks = lockManager();
  if (!locks) {
    const mine = unsent.filter((u) => u.email === email).sort((a, b) => a.entry.at - b.entry.at);
    for (const u of mine) unsent.splice(unsent.indexOf(u), 1);
    await Promise.all(
      mine.map(async (u) => {
        if (!(await deliver(email, u.id, u.entry, transport))) unsent.push(u);
      })
    );
    return;
  }
  const ids = stored(email).map((s) => s.id);
  if (!ids.length) return;
  const claims = await Promise.all(ids.map((id) => claim(locks, id)));
  const byDay = new Map<string, Held[]>();
  ids.forEach((id, i) => {
    const release = claims[i];
    if (!release) return; // a live page is sending it
    // Read again under the lock: the page that held it may have settled it.
    const entry = read(email, id);
    if (!entry) return release();
    byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), { id, entry, release }]);
  });
  await Promise.all([...byDay].map(([day, held]) => flushDay(email, day, held, transport)));
}
