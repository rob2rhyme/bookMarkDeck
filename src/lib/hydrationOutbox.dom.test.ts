import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { webLocksMock, type LockManagerLike, type WebLocksMock } from "@/test/webLocksMock";
import {
  flushHydration,
  hydrationInFlight,
  type HydrationTransport,
  recordHydration,
} from "./hydrationOutbox";

const EMAIL = "a@example.com";
const PREFIX = `bookmarkdeck:focus:hydration-outbox:v1:${EMAIL}:`;
const DAY = "2026-10-11";

/** Let every queued microtask and lock grant run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

type Sent = { email: string; day: string; delta: number; id: string };

/**
 * A server that records what reaches it, by a send or a recovery. "hold" keeps
 * sends pending (no ack yet); "offline" also fails recoveries, as a transaction
 * does; "lose-acks" lands sends without ever acknowledging them.
 */
function server() {
  const sent: Sent[] = [];
  const landed = new Map<string, Set<string>>();
  let mode: "online" | "hold" | "offline" | "lose-acks" = "online";
  const held: (() => void)[] = [];
  const transport: HydrationTransport = {
    send: vi.fn((email: string, day: string, delta: number, id: string) => {
      const land = () => {
        sent.push({ email, day, delta, id });
        if (!landed.has(day)) landed.set(day, new Set());
        landed.get(day)!.add(id);
      };
      if (mode === "online") {
        land();
        return Promise.resolve();
      }
      if (mode === "lose-acks") {
        land();
        return new Promise<void>(() => {});
      }
      return new Promise<void>((resolve) =>
        held.push(() => {
          land();
          resolve();
        })
      );
    }),
    // A transaction: reads the day on the server, writes only without the receipt.
    recover: vi.fn(async (email: string, day: string, delta: number, id: string) => {
      if (mode === "offline") throw new Error("offline");
      if (landed.get(day)?.has(id)) return;
      sent.push({ email, day, delta, id });
      if (!landed.has(day)) landed.set(day, new Set());
      landed.get(day)!.add(id);
    }),
  };
  return {
    transport,
    sent,
    total: (day = DAY) => sent.filter((s) => s.day === day).reduce((n, s) => n + s.delta, 0),
    set: (m: typeof mode) => (mode = m),
    /** Deliver the sends that were held. */
    release: () => held.splice(0).forEach((f) => f()),
    /** The held sends die with their page: they never reach the server. */
    drop: () => void held.splice(0),
  };
}

const entries = () =>
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => ({ id: k.slice(PREFIX.length), ...JSON.parse(localStorage.getItem(k)!) }));

let locks: WebLocksMock;
let page: LockManagerLike;

beforeEach(() => {
  localStorage.clear();
  locks = webLocksMock();
  page = locks.client();
  locks.use(page);
});
afterEach(() => locks.uninstall());

describe("recordHydration", () => {
  // At once, not after the lock is granted (a task away in browsers): a snapshot
  // arriving in between would show the count without this cup.
  it("sends at once, before its lock is granted", () => {
    const s = server();
    recordHydration(EMAIL, DAY, 1, { send: true }, s.transport);
    expect(s.transport.send).toHaveBeenCalledOnce();
  });

  // A removal sent ahead of the cup it removes would clamp at 0, and the day
  // would end one high.
  it("waits behind the day's queued changes, and delivers them all in order", async () => {
    const s = server();
    localStorage.setItem(`${PREFIX}earlier`, JSON.stringify({ day: DAY, delta: 1, at: 1 }));
    recordHydration(EMAIL, DAY, -1, { send: true }, s.transport);
    await settle();
    await settle();
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(s.sent.map((x) => x.delta)).toEqual([1, -1]);
    expect(entries()).toEqual([]);
  });

  it("doesn't wait behind its own changes still on their way", async () => {
    const s = server();
    s.set("hold");
    recordHydration(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    recordHydration(EMAIL, DAY, 1, { send: true }, s.transport);
    expect(s.transport.send).toHaveBeenCalledTimes(2);
    s.release();
    await settle();
    expect(s.total()).toBe(2);
  });

  it("sends the change with its own id, and settles it once acknowledged", async () => {
    const s = server();
    recordHydration(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    expect(s.transport.send).toHaveBeenCalledExactlyOnceWith(EMAIL, DAY, 1, expect.any(String));
    expect(entries()).toEqual([]);
  });

  it("keeps the change until it is acknowledged", async () => {
    const s = server();
    s.set("hold");
    recordHydration(EMAIL, DAY, -1, { send: true }, s.transport);
    await settle();
    expect(entries()).toMatchObject([{ day: DAY, delta: -1 }]);
    expect(hydrationInFlight()).toBe(true);
    s.release();
    await settle();
    expect(entries()).toEqual([]);
    expect(hydrationInFlight()).toBe(false);
  });

  it("keeps a change whose send fails, and a flush sends it", async () => {
    const s = server();
    vi.mocked(s.transport.send).mockRejectedValueOnce(new Error("denied"));
    recordHydration(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    expect(entries()).toHaveLength(1);
    await flushHydration(EMAIL, s.transport);
    expect(s.total()).toBe(1);
    expect(entries()).toEqual([]);
  });

  it("only stores a change it isn't asked to send, for a flush to deliver", async () => {
    const s = server();
    recordHydration(EMAIL, DAY, 1, { send: false }, s.transport);
    await settle();
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(entries()).toHaveLength(1);
    await flushHydration(EMAIL, s.transport);
    expect(s.total()).toBe(1);
    expect(entries()).toEqual([]);
  });

  it("ignores a zero change", async () => {
    const s = server();
    recordHydration(EMAIL, DAY, 0, { send: true }, s.transport);
    await settle();
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(entries()).toEqual([]);
  });

  // Storage blocked or full: the change can't be stored, so this page keeps it.
  describe("when the change can't be stored", () => {
    afterEach(() => vi.restoreAllMocks());
    const full = () =>
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });

    it("keeps an unsent change in this page, for a flush to deliver once", async () => {
      const s = server();
      full();
      recordHydration(EMAIL, DAY, 1, { send: false }, s.transport);
      await settle();
      await flushHydration(EMAIL, s.transport);
      await flushHydration(EMAIL, s.transport);
      expect(s.total()).toBe(1);
    });

    it("keeps it in this page through a flush that can't deliver it", async () => {
      const s = server();
      full();
      recordHydration(EMAIL, DAY, 1, { send: false }, s.transport);
      await settle();
      s.set("offline");
      await flushHydration(EMAIL, s.transport);
      s.set("online");
      await flushHydration(EMAIL, s.transport);
      expect(s.total()).toBe(1);
    });

    it("keeps a refused send in this page, for a flush to deliver", async () => {
      const s = server();
      full();
      vi.mocked(s.transport.send).mockRejectedValueOnce(new Error("refused"));
      recordHydration(EMAIL, DAY, 1, { send: true }, s.transport);
      await settle();
      await flushHydration(EMAIL, s.transport);
      expect(s.total()).toBe(1);
    });

    it("drops no older change when the new one couldn't be stored", async () => {
      const s = server();
      for (let i = 0; i < 500; i++) {
        localStorage.setItem(`${PREFIX}old${i}`, JSON.stringify({ day: DAY, delta: 1, at: i }));
      }
      full();
      recordHydration(EMAIL, DAY, 1, { send: false }, s.transport);
      await settle();
      expect(entries()).toHaveLength(500);
      vi.restoreAllMocks();
      localStorage.clear();
      await flushHydration(EMAIL, s.transport); // this page still holds it
      expect(s.total()).toBe(1);
    });

    it("holds a later change behind one this page holds", async () => {
      const s = server();
      full();
      recordHydration(EMAIL, DAY, 1, { send: false }, s.transport);
      await settle();
      recordHydration(EMAIL, DAY, -1, { send: true }, s.transport);
      await settle();
      expect(s.transport.send).not.toHaveBeenCalled();
      expect(s.sent.map((x) => x.delta)).toEqual([1, -1]);
    });

    it("keeps the change in this page when asking for its lock throws", async () => {
      const s = server();
      locks.use({
        request: () => {
          throw new DOMException("blocked", "SecurityError");
        },
      } as unknown as LockManagerLike);
      expect(() => recordHydration(EMAIL, DAY, 1, { send: false }, s.transport)).not.toThrow();
      await flushHydration(EMAIL, s.transport);
      expect(s.total()).toBe(1);
    });

    it("keeps the change in this page when its lock is refused", async () => {
      const s = server();
      locks.use({
        request: () => Promise.reject(new DOMException("blocked", "SecurityError")),
      } as unknown as LockManagerLike);
      recordHydration(EMAIL, DAY, 1, { send: false }, s.transport);
      await settle();
      await flushHydration(EMAIL, s.transport);
      await flushHydration(EMAIL, s.transport);
      expect(s.total()).toBe(1);
    });
  });

  // A device that never syncs would otherwise grow the outbox for ever.
  it("keeps only the newest 500 changes", async () => {
    const s = server();
    for (let i = 0; i < 505; i++) {
      localStorage.setItem(`${PREFIX}old${i}`, JSON.stringify({ day: DAY, delta: 1, at: i }));
    }
    recordHydration(EMAIL, DAY, 1, { send: false }, s.transport);
    await settle();
    expect(entries()).toHaveLength(500);
    expect(entries().some((e) => e.id === "old0")).toBe(false);
    expect(entries().some((e) => e.at > 1000)).toBe(true); // the new one
  });
});

describe("flushHydration", () => {
  /** A change left behind by a page that died before it was acknowledged. */
  const orphan = (id: string, delta = 1, at = 1, day = DAY) =>
    localStorage.setItem(`${PREFIX}${id}`, JSON.stringify({ day, delta, at }));

  it("sends an orphaned change once, even when two pages flush together", async () => {
    const s = server();
    orphan("x");
    const other = locks.client();
    const mine = flushHydration(EMAIL, s.transport);
    locks.use(other);
    const theirs = flushHydration(EMAIL, s.transport);
    await Promise.all([mine, theirs]);
    expect(s.sent).toEqual([{ email: EMAIL, day: DAY, delta: 1, id: "x" }]);
    expect(entries()).toEqual([]);
  });

  it("is safe to call twice at once from one page", async () => {
    const s = server();
    orphan("x");
    await Promise.all([flushHydration(EMAIL, s.transport), flushHydration(EMAIL, s.transport)]);
    await flushHydration(EMAIL, s.transport);
    expect(s.sent).toHaveLength(1);
  });

  // Another page can settle a change between this page listing it and holding
  // its lock; sending the stale copy would count it twice.
  it("doesn't send a change settled between listing it and holding its lock", async () => {
    const s = server();
    orphan("x");
    const flushing = flushHydration(EMAIL, s.transport);
    localStorage.removeItem(`${PREFIX}x`); // settled elsewhere, lock since released
    await flushing;
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(s.transport.recover).not.toHaveBeenCalled();
  });

  it("leaves a change alone while a live page holds it", async () => {
    const s = server();
    orphan("x");
    const done = locks.holdAs("bookmarkdeck:hydration-op:x");
    await flushHydration(EMAIL, s.transport);
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(entries()).toHaveLength(1);
    done();
    await flushHydration(EMAIL, s.transport);
    expect(s.sent).toHaveLength(1);
  });

  it("doesn't resend a change another page is still sending", async () => {
    const s = server();
    s.set("hold");
    recordHydration(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    locks.use(locks.client());
    s.set("online");
    await flushHydration(EMAIL, s.transport);
    expect(s.transport.send).toHaveBeenCalledTimes(1);
    s.release();
    await settle();
    expect(s.total()).toBe(1);
    expect(entries()).toEqual([]);
  });

  // The page's write committed but the acknowledgement never came back before
  // it closed: the receipt says so, and sending it again would count it twice.
  it("settles without sending a change whose receipt is on the server", async () => {
    const s = server();
    s.set("lose-acks");
    recordHydration(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    locks.crash(page);
    locks.use(locks.client());
    s.set("online");
    await flushHydration(EMAIL, s.transport);
    expect(s.sent).toHaveLength(1);
    expect(entries()).toEqual([]);
  });

  it("sends a dead page's change that never reached the server", async () => {
    const s = server();
    s.set("hold");
    recordHydration(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    s.drop(); // its queued write dies with it
    locks.crash(page);
    locks.use(locks.client());
    s.set("online");
    await flushHydration(EMAIL, s.transport);
    expect(s.total()).toBe(1);
    expect(entries()).toEqual([]);
  });

  it("keeps a change it can't recover offline, and retries later", async () => {
    const s = server();
    orphan("x");
    s.set("offline");
    await flushHydration(EMAIL, s.transport);
    expect(s.sent).toEqual([]);
    expect(entries()).toHaveLength(1);
    expect(locks.heldNames()).toEqual([]); // released for the next try
    s.set("online");
    await flushHydration(EMAIL, s.transport);
    expect(s.sent).toHaveLength(1);
  });

  // A removal applied before the add it follows clamps at 0 and is lost.
  it("sends a day's changes in the order they were made", async () => {
    const s = server();
    orphan("b", -1, 20);
    orphan("a", 1, 10);
    orphan("c", 1, 30);
    await flushHydration(EMAIL, s.transport);
    expect(s.sent.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("recovers each change while holding its lock, one at a time per day", async () => {
    const s = server();
    orphan("a", 1, 1, "2026-10-10");
    orphan("b", 1, 2, "2026-10-10");
    orphan("c", 1, 3, DAY);
    let busy = 0;
    const recover = s.transport.recover;
    s.transport.recover = vi.fn(async (email: string, day: string, delta: number, id: string) => {
      expect(locks.held(`bookmarkdeck:hydration-op:${id}`)).toBe(true);
      if (day === "2026-10-10") expect(++busy).toBe(1);
      await settle();
      if (day === "2026-10-10") busy--;
      return recover(email, day, delta, id);
    });
    await flushHydration(EMAIL, s.transport);
    expect(s.sent.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
  });

  // Two flushes at once could each hold some of a day's changes and deliver them
  // out of order; one asked for meanwhile runs after, and sees what's new.
  it("runs one flush at a time, and a later one sees changes made meanwhile", async () => {
    const s = server();
    const gates: (() => void)[] = [];
    const recover = s.transport.recover;
    s.transport.recover = vi.fn(async (...args: Parameters<typeof recover>) => {
      await new Promise<void>((r) => gates.push(r));
      return recover(...args);
    });
    const open = async () => {
      await settle();
      gates.shift()?.();
    };
    orphan("a", 1, 1);
    const first = flushHydration(EMAIL, s.transport);
    await settle();
    const second = flushHydration(EMAIL, s.transport); // waits for the first…
    expect(flushHydration(EMAIL, s.transport)).toBe(second); // …and this one shares it
    orphan("b", 1, 2);
    await open(); // a lands; the second starts, and holds b
    await first;
    await settle();
    expect(s.transport.recover).toHaveBeenCalledTimes(2);
    orphan("c", 1, 3); // made while the second runs: it has already looked
    const third = flushHydration(EMAIL, s.transport);
    expect(third).not.toBe(second);
    await open(); // b
    await second;
    await open(); // c
    await third;
    expect(s.sent.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("stops a day at the first change it can't recover, so none overtakes it", async () => {
    const s = server();
    orphan("a", 1, 1);
    orphan("b", -1, 2);
    vi.mocked(s.transport.recover).mockRejectedValueOnce(new Error("unavailable"));
    await flushHydration(EMAIL, s.transport);
    expect(s.sent).toEqual([]);
    expect(entries()).toHaveLength(2);
    await flushHydration(EMAIL, s.transport);
    expect(s.sent.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("touches only the account it is asked about", async () => {
    const s = server();
    const other = "bookmarkdeck:focus:hydration-outbox:v1:b@example.com:";
    localStorage.setItem(`${other}y`, JSON.stringify({ day: DAY, delta: 1, at: 1 }));
    localStorage.setItem(`${other}z`, "{written by a later version");
    await flushHydration(EMAIL, s.transport);
    recordHydration(EMAIL, DAY, 1, { send: false }, s.transport);
    await settle();
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${other}y`)).not.toBeNull();
    expect(localStorage.getItem(`${other}z`)).not.toBeNull();
  });

  it("drops a record it can't read", async () => {
    const s = server();
    localStorage.setItem(`${PREFIX}junk`, "{not json");
    localStorage.setItem(`${PREFIX}bad`, JSON.stringify({ day: "yesterday", delta: 1, at: 1 }));
    await flushHydration(EMAIL, s.transport);
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${PREFIX}junk`)).toBeNull();
    expect(localStorage.getItem(`${PREFIX}bad`)).toBeNull();
  });
});

// Without Web Locks (an insecure context, Safari before 15.4) no page can tell
// whether another is still sending a stored change, so nothing is stored for
// another page to find: a change is sent at once, or kept in this page.
describe("without Web Locks", () => {
  beforeEach(() => locks.use(null));

  it("sends at once and stores nothing", async () => {
    const s = server();
    recordHydration(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    expect(s.total()).toBe(1);
    expect(entries()).toEqual([]);
  });

  it("keeps an unsent change in this page, and a flush delivers it once", async () => {
    const s = server();
    recordHydration(EMAIL, DAY, 1, { send: false }, s.transport);
    expect(entries()).toEqual([]);
    await Promise.all([flushHydration(EMAIL, s.transport), flushHydration(EMAIL, s.transport)]);
    await flushHydration(EMAIL, s.transport);
    expect(s.sent).toHaveLength(1);
  });

  it("never sends a change another page stored", async () => {
    const s = server();
    localStorage.setItem(`${PREFIX}x`, JSON.stringify({ day: DAY, delta: 1, at: 1 }));
    await flushHydration(EMAIL, s.transport);
    expect(s.transport.send).not.toHaveBeenCalled();
  });
});
