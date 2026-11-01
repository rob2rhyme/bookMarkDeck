import { vi } from "vitest";

// Test-only: an in-memory focusHydration collection seen from one page, for
// the hook tests of both pillars that write it (Focus's useHydration and the
// habits water link). Mock "@/features/focus/data/focusData" with
// `hydrationData()` and drive `cloud`. The server holds
// a count and the receipts of the changes it applied, per day. While the page
// is offline its own writes queue, and nothing another device writes is heard.
// A closed page's queued writes die with it; a write can also land without its
// acknowledgement ever coming back. Listeners hear what subscribeHydration
// passes on with serverFirst: the server's count, and nothing while this page
// has a write to that day unacknowledged.
//
// Both are kept on globalThis, so a test can load a fresh copy of a hook (and
// the outbox under it) with vi.resetModules — one per tab, as browsers do —
// and every copy still talks to the same cloud through the same mocks.
const shared = globalThis as {
  __bmdHydrationCloud?: ReturnType<typeof makeCloud>;
  __bmdHydrationData?: ReturnType<typeof makeData>;
};

export const cloud = (shared.__bmdHydrationCloud ??= makeCloud());

/** The hydration half of focusData, wired to `cloud`. */
export function hydrationData() {
  return (shared.__bmdHydrationData ??= makeData());
}

function makeCloud() {
  type Write = { day: string; apply: (v: number) => number; id?: string; done: () => void };
  type Listener = (v: number | null) => void;
  const days = new Map<string, number>();
  const receipts = new Map<string, Set<string>>();
  const listeners = new Map<string, Set<Listener>>();
  let queue: Write[] = []; // written offline, not yet landed
  let unacked: Write[] = []; // landed, acknowledgement lost
  let silent = false;
  let losingAcks = false;
  const server = (day: string) => (days.has(day) ? days.get(day)! : null);
  const pending = (day: string) => [...queue, ...unacked].some((w) => w.day === day);
  const land = (w: Write) => {
    days.set(w.day, w.apply(days.get(w.day) ?? 0));
    if (w.id) receipts.set(w.day, new Set([...(receipts.get(w.day) ?? []), w.id]));
  };
  /** The server answers `day`'s listeners. */
  const answer = (day: string) => {
    if (silent || pending(day)) return;
    listeners.get(day)?.forEach((cb) => cb(server(day)));
  };
  const commit = (w: Omit<Write, "done">) =>
    new Promise<void>((resolve) => {
      const write = { ...w, done: resolve };
      if (silent) {
        queue.push(write);
        return;
      }
      land(write);
      if (losingAcks) return void unacked.push(write);
      // Acknowledged, and heard back, after the call that made it returns — as
      // with the SDK, never inside it.
      Promise.resolve().then(() => {
        resolve();
        answer(w.day);
      });
    });
  return {
    days,
    subscribedDays: [] as string[],
    reset() {
      days.clear();
      receipts.clear();
      listeners.clear();
      queue = [];
      unacked = [];
      silent = false;
      losingAcks = false;
      this.subscribedDays.length = 0;
    },
    /** This page loses the network. */
    goSilent() {
      silent = true;
    },
    /** Back online: the queued writes land in order, and every listener hears the server. */
    reconnect() {
      silent = false;
      const sent = queue;
      queue = [];
      sent.forEach((w) => {
        land(w);
        if (losingAcks) unacked.push(w);
        else w.done();
      });
      listeners.forEach((_, day) => answer(day));
    },
    /** From now on a write lands, but its acknowledgement never comes back. */
    loseAcks() {
      losingAcks = true;
    },
    /** The page closes: its queued writes die unsent, and none is pending any more. */
    killTab() {
      queue = [];
      unacked = [];
      losingAcks = false;
    },
    /** Another device writes `day`'s count. */
    write(day: string, cups: number) {
      days.set(day, cups);
      answer(day);
    },
    /** Another device adds to `day`'s count. */
    add(day: string, delta: number) {
      days.set(day, Math.max(0, (days.get(day) ?? 0) + delta));
      answer(day);
    },
    /** A snapshot of `day` arriving, whatever the store holds. */
    snapshot(day: string, cups: number | null) {
      listeners.get(day)?.forEach((cb) => cb(cups));
    },
    listen(day: string, cb: Listener) {
      this.subscribedDays.push(day);
      if (!listeners.has(day)) listeners.set(day, new Set());
      const set = listeners.get(day)!;
      set.add(cb);
      // Firestore delivers the first snapshot asynchronously.
      Promise.resolve().then(() => {
        if (!silent && !pending(day) && set.has(cb)) cb(server(day));
      });
      return () => set.delete(cb);
    },
    /** This page's increment, with its receipt when it carries one. */
    increment: (day: string, delta: number, id?: string) =>
      commit({ day, id, apply: (v) => Math.max(0, v + delta) }),
    /** This page writing a count outright. */
    set: (day: string, cups: number) => commit({ day, apply: () => cups }),
    /** A transaction: reads the server, and writes only without the receipt. */
    async recover(day: string, delta: number, id: string) {
      if (silent) throw new Error("offline");
      if (receipts.get(day)?.has(id)) return;
      land({ day, id, apply: (v) => Math.max(0, v + delta), done: () => {} });
      answer(day);
    },
    /** A one-off read: undefined while this page has a write to `day` unacknowledged. */
    async fetch(day: string) {
      return pending(day) ? undefined : server(day);
    },
  };
}

function makeData() {
  const send = vi.fn((_e: string, day: string, delta: number, id?: string) =>
    cloud.increment(day, delta, id)
  );
  return {
    addHydration: send,
    hydrationTransport: {
      send,
      recover: vi.fn((_e: string, day: string, delta: number, id: string) =>
        cloud.recover(day, delta, id)
      ),
    },
    fetchHydration: vi.fn((_e: string, day: string) => cloud.fetch(day)),
    saveHydration: vi.fn((_e: string, day: string, cups: number) => cloud.set(day, cups)),
    subscribeHydration: vi.fn(
      (_e: string, day: string, cb: (v: number | null) => void, _opts?: unknown) =>
        cloud.listen(day, cb)
    ),
  };
}
