import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { webLocksMock, type LockManagerLike, type WebLocksMock } from "@/test/webLocksMock";
import type { HydrationTransport } from "./hydrationOutbox";

const EMAIL = "a@example.com";
const B = "b@example.com";
const PREFIX = `bookmarkdeck:focus:hydration-outbox:v1:${EMAIL}:`;
const DAY = "2026-10-11";

/** Let every queued microtask and lock grant run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

const full = () =>
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });

type Sent = { email: string; day: string; delta: number; id: string };

/**
 * A server that records what reaches it, by a send or a recovery, and keeps
 * each day's count as Firestore does: a removal clamps at 0. Each page has its
 * own transport, standing in for its own SDK: "hold" keeps its sends pending
 * (no ack yet), "offline" also fails its recoveries, as a transaction does, and
 * "lose-acks" lands its sends without ever acknowledging them.
 */
function cloud() {
  const sent: Sent[] = [];
  const landed = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  const land = (s: Sent) => {
    sent.push(s);
    if (!landed.has(s.day)) landed.set(s.day, new Set());
    landed.get(s.day)!.add(s.id);
    counts.set(s.day, Math.max(0, (counts.get(s.day) ?? 0) + s.delta));
  };
  const page = () => {
    let mode: "online" | "hold" | "offline" | "lose-acks" = "online";
    const held: (() => void)[] = [];
    const transport: HydrationTransport = {
      send: vi.fn((email: string, day: string, delta: number, id: string) => {
        if (mode === "online") {
          land({ email, day, delta, id });
          return Promise.resolve();
        }
        if (mode === "lose-acks") {
          land({ email, day, delta, id });
          return new Promise<void>(() => {});
        }
        return new Promise<void>((resolve) =>
          held.push(() => {
            land({ email, day, delta, id });
            resolve();
          })
        );
      }),
      // A transaction: reads the day on the server, writes only without the receipt.
      recover: vi.fn(async (email: string, day: string, delta: number, id: string) => {
        if (mode === "offline") throw new Error("offline");
        if (landed.get(day)?.has(id)) return;
        land({ email, day, delta, id });
      }),
    };
    return {
      transport,
      set: (m: typeof mode) => (mode = m),
      /** Deliver the sends that were held, in the order they were made. */
      release: () => held.splice(0).forEach((f) => f()),
      /** The held sends die with their page: they never reach the server. */
      drop: () => void held.splice(0),
    };
  };
  return {
    sent,
    page,
    total: (day = DAY) => sent.filter((s) => s.day === day).reduce((n, s) => n + s.delta, 0),
    /** The day's count on the server, clamps included. */
    cups: (day = DAY) => counts.get(day) ?? 0,
  };
}

/** A cloud seen by one page. */
function server() {
  const c = cloud();
  return { ...c, ...c.page() };
}

const entries = () =>
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => ({ id: k.slice(PREFIX.length), ...JSON.parse(localStorage.getItem(k)!) }));

/** Recoveries wait for their gate; `open` before the call lets it through at once. */
function gates() {
  const all = new Map<string, { open: () => void; opened: Promise<void> }>();
  const gate = (key: string) => {
    if (!all.has(key)) {
      let open = () => {};
      const opened = new Promise<void>((r) => (open = r));
      all.set(key, { open, opened });
    }
    return all.get(key)!;
  };
  return { wait: (key: string) => gate(key).opened, open: (key: string) => gate(key).open() };
}

let locks: WebLocksMock;

/**
 * A page: its own copy of the module, so its state is its own, and its own
 * lock manager, installed for each call. Pages share localStorage and the lock
 * registry, as tabs do. `null` is a page without Web Locks. A test that drove
 * two "pages" through one module never had two pages: one's flushes queued
 * behind the other's, and one's sends counted as the other's own.
 */
async function openPage(manager: LockManagerLike | null = locks.client()) {
  vi.resetModules();
  const mod = await import("./hydrationOutbox");
  const install = () => locks.use(manager);
  return {
    manager,
    record: (...args: Parameters<typeof mod.recordHydration>) => {
      install();
      return mod.recordHydration(...args);
    },
    flush: (...args: Parameters<typeof mod.flushHydration>) => {
      install();
      return mod.flushHydration(...args);
    },
    inFlight: mod.hydrationInFlight,
    waiting: mod.hydrationWaiting,
    retryDue: mod.hydrationRetryDue,
  };
}

let p: Awaited<ReturnType<typeof openPage>>;

beforeEach(async () => {
  localStorage.clear();
  locks = webLocksMock();
  p = await openPage();
});
afterEach(() => {
  locks.uninstall();
  vi.restoreAllMocks();
});

describe("recordHydration", () => {
  // At once, not after the lock is granted (a task away in browsers): a snapshot
  // arriving in between would show the count without this cup.
  it("sends at once, before its lock is granted", () => {
    const s = server();
    p.record(EMAIL, DAY, 1, { send: true }, s.transport);
    expect(s.transport.send).toHaveBeenCalledOnce();
  });

  // Until its lock is held no other page can find it: one that did would find
  // it unclaimed and deliver it again while it is being sent.
  it("stores a change only once its lock is held", async () => {
    const c = cloud();
    const a = c.page();
    a.set("hold");
    const grants: (() => void)[] = [];
    const real = locks.client() as unknown as { request: (...x: unknown[]) => Promise<unknown> };
    const mine = await openPage({
      request: (...args: unknown[]) =>
        new Promise((resolve, reject) =>
          grants.push(() => void real.request(...args).then(resolve, reject))
        ),
    } as unknown as LockManagerLike);
    mine.record(EMAIL, DAY, 1, { send: true }, a.transport);
    await settle();
    expect(entries()).toEqual([]);
    const other = await openPage();
    await other.flush(EMAIL, c.page().transport);
    expect(c.sent).toEqual([]);
    grants.splice(0).forEach((g) => g());
    await settle();
    expect(entries()).toHaveLength(1);
    a.release();
    await settle();
    await settle();
    expect(c.total()).toBe(1);
    expect(entries()).toEqual([]);
  });

  // A removal sent ahead of the cup it removes would clamp at 0, and the day
  // would end one high.
  it("waits behind this page's changes waiting for a flush, and delivers them in order", async () => {
    const s = server();
    p.record(EMAIL, DAY, 1, { send: false }, s.transport);
    await settle();
    p.record(EMAIL, DAY, -1, { send: true }, s.transport);
    await settle();
    await settle();
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(s.sent.map((x) => x.delta)).toEqual([1, -1]);
    expect(s.cups()).toBe(0);
    expect(entries()).toEqual([]);
  });

  // Another tab's change, still on its way, used to send this page's next one
  // by transaction — which overtook this page's own queued send: a removal
  // landed ahead of the cups it removed, clamped at 0, and the day ended high.
  it("doesn't wait behind another page's changes, so its own sends keep their order", async () => {
    const c = cloud();
    const a = c.page();
    const b = c.page();
    a.set("hold");
    b.set("hold");
    const other = await openPage();
    other.record(EMAIL, DAY, 1, { send: true }, a.transport);
    await settle();
    p.record(EMAIL, DAY, 8, { send: true }, b.transport);
    await settle();
    p.record(EMAIL, DAY, -8, { send: true }, b.transport);
    await settle();
    await settle();
    expect(b.transport.recover).not.toHaveBeenCalled();
    b.release();
    a.release();
    await settle();
    expect(c.cups()).toBe(1);
  });

  // This page's earlier change is being delivered by another page's flush: a
  // later one sent meanwhile could land first.
  it("waits for its earlier change while another page delivers it", async () => {
    const c = cloud();
    const mine = c.page();
    const theirs = c.page();
    const g = gates();
    const recover = theirs.transport.recover;
    theirs.transport.recover = vi.fn(async (...args: Parameters<typeof recover>) => {
      await g.wait("theirs");
      return recover(...args);
    });
    p.record(EMAIL, DAY, 1, { send: false }, mine.transport);
    await settle();
    const other = await openPage();
    const delivering = other.flush(EMAIL, theirs.transport);
    await settle();
    expect(theirs.transport.recover).toHaveBeenCalledOnce();
    p.record(EMAIL, DAY, -1, { send: true }, mine.transport);
    await settle();
    await settle();
    expect(c.sent).toEqual([]);
    expect(p.retryDue(EMAIL)).toBe(true);
    g.open("theirs");
    await delivering;
    await p.flush(EMAIL, mine.transport);
    expect(c.sent.map((x) => x.delta)).toEqual([1, -1]);
    expect(c.cups()).toBe(0);
    expect(entries()).toEqual([]);
  });

  // Signed out with a send still queued, then a change made: the flush that
  // delivers it must not overtake the send.
  it("leaves a day alone while this page is still sending to it", async () => {
    const s = server();
    s.set("hold");
    p.record(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    p.record(EMAIL, DAY, -1, { send: false }, s.transport);
    await settle();
    s.set("online");
    await p.flush(EMAIL, s.transport);
    expect(s.sent).toEqual([]);
    expect(p.retryDue(EMAIL)).toBe(true);
    s.release();
    await settle();
    await p.flush(EMAIL, s.transport);
    expect(s.sent.map((x) => x.delta)).toEqual([1, -1]);
    expect(s.cups()).toBe(0);
    expect(p.retryDue(EMAIL)).toBe(false);
  });

  // The order key was the wall clock alone: two changes in one millisecond, or
  // a clock stepped back between them, sorted either way.
  describe("keeps this page's order without trusting the clock", () => {
    it("through changes in one millisecond", async () => {
      const s = server();
      full();
      vi.spyOn(Date, "now").mockReturnValue(1_000);
      p.record(EMAIL, DAY, 1, { send: false }, s.transport);
      p.record(EMAIL, DAY, 1, { send: false }, s.transport);
      p.record(EMAIL, DAY, -2, { send: true }, s.transport);
      await settle();
      await p.flush(EMAIL, s.transport);
      expect(s.sent.map((x) => x.delta)).toEqual([1, 1, -2]);
      expect(s.cups()).toBe(0);
    });

    it("through a clock stepped back", async () => {
      const s = server();
      const now = vi.spyOn(Date, "now").mockReturnValue(2_000);
      p.record(EMAIL, DAY, 1, { send: false }, s.transport);
      await settle();
      now.mockReturnValue(1_000);
      p.record(EMAIL, DAY, -1, { send: false }, s.transport);
      await settle();
      await p.flush(EMAIL, s.transport);
      expect(s.sent.map((x) => x.delta)).toEqual([1, -1]);
      expect(s.cups()).toBe(0);
    });
  });

  // A flush takes this page's held changes out of the list it keeps them in;
  // they are still waiting until they land.
  it("waits behind held changes a flush is delivering", async () => {
    const s = server();
    full();
    const g = gates();
    const recover = s.transport.recover;
    s.transport.recover = vi.fn(async (...args: Parameters<typeof recover>) => {
      if (args[2] > 0) await g.wait("add");
      return recover(...args);
    });
    p.record(EMAIL, DAY, 1, { send: false }, s.transport);
    await settle();
    const delivering = p.flush(EMAIL, s.transport);
    await settle();
    p.record(EMAIL, DAY, -1, { send: true }, s.transport);
    await settle();
    expect(s.transport.send).not.toHaveBeenCalled();
    g.open("add");
    await delivering;
    await p.flush(EMAIL, s.transport);
    expect(s.sent.map((x) => x.delta)).toEqual([1, -1]);
    expect(s.cups()).toBe(0);
  });

  it("doesn't wait behind its own changes still on their way", async () => {
    const s = server();
    s.set("hold");
    p.record(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    p.record(EMAIL, DAY, 1, { send: true }, s.transport);
    expect(s.transport.send).toHaveBeenCalledTimes(2);
    s.release();
    await settle();
    expect(s.total()).toBe(2);
  });

  it("sends the change with its own id, and settles it once acknowledged", async () => {
    const s = server();
    p.record(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    expect(s.transport.send).toHaveBeenCalledExactlyOnceWith(EMAIL, DAY, 1, expect.any(String));
    expect(entries()).toEqual([]);
  });

  it("keeps the change until it is acknowledged", async () => {
    const s = server();
    s.set("hold");
    p.record(EMAIL, DAY, -1, { send: true }, s.transport);
    await settle();
    expect(entries()).toMatchObject([{ day: DAY, delta: -1 }]);
    expect(p.inFlight()).toBe(true);
    s.release();
    await settle();
    expect(entries()).toEqual([]);
    expect(p.inFlight()).toBe(false);
  });

  it("keeps a change whose send fails, and a flush sends it", async () => {
    const s = server();
    vi.mocked(s.transport.send).mockRejectedValueOnce(new Error("denied"));
    p.record(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    expect(entries()).toHaveLength(1);
    await p.flush(EMAIL, s.transport);
    expect(s.total()).toBe(1);
    expect(entries()).toEqual([]);
  });

  it("only stores a change it isn't asked to send, for a flush to deliver", async () => {
    const s = server();
    p.record(EMAIL, DAY, 1, { send: false }, s.transport);
    await settle();
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(entries()).toHaveLength(1);
    await p.flush(EMAIL, s.transport);
    expect(s.total()).toBe(1);
    expect(entries()).toEqual([]);
  });

  it("ignores a zero change", async () => {
    const s = server();
    p.record(EMAIL, DAY, 0, { send: true }, s.transport);
    await settle();
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(entries()).toEqual([]);
  });

  // Storage blocked or full: the change can't be stored, so this page keeps it.
  describe("when the change can't be stored", () => {
    it("keeps an unsent change in this page, for a flush to deliver once", async () => {
      const s = server();
      full();
      p.record(EMAIL, DAY, 1, { send: false }, s.transport);
      await settle();
      await p.flush(EMAIL, s.transport);
      await p.flush(EMAIL, s.transport);
      expect(s.total()).toBe(1);
    });

    it("keeps it in this page through a flush that can't deliver it", async () => {
      const s = server();
      full();
      p.record(EMAIL, DAY, 1, { send: false }, s.transport);
      await settle();
      s.set("offline");
      await p.flush(EMAIL, s.transport);
      s.set("online");
      await p.flush(EMAIL, s.transport);
      expect(s.total()).toBe(1);
    });

    it("keeps a refused send in this page, for a flush to deliver", async () => {
      const s = server();
      full();
      vi.mocked(s.transport.send).mockRejectedValueOnce(new Error("refused"));
      p.record(EMAIL, DAY, 1, { send: true }, s.transport);
      await settle();
      await p.flush(EMAIL, s.transport);
      expect(s.total()).toBe(1);
    });

    it("drops no older change when the new one couldn't be stored", async () => {
      const s = server();
      for (let i = 0; i < 500; i++) {
        localStorage.setItem(`${PREFIX}old${i}`, JSON.stringify({ day: DAY, delta: 1, at: i }));
      }
      full();
      p.record(EMAIL, DAY, 1, { send: false }, s.transport);
      await settle();
      expect(entries()).toHaveLength(500);
      vi.restoreAllMocks();
      localStorage.clear();
      await p.flush(EMAIL, s.transport); // this page still holds it
      expect(s.total()).toBe(1);
    });

    // Left alone while the page still sends to the day, a change held only
    // here goes back to wait for the next flush rather than out of the page.
    it("keeps a change a flush left alone, for the next one", async () => {
      const s = server();
      full();
      s.set("hold");
      p.record(EMAIL, DAY, 1, { send: true }, s.transport);
      p.record(EMAIL, DAY, -1, { send: false }, s.transport);
      await settle();
      await p.flush(EMAIL, s.transport);
      expect(s.sent).toEqual([]);
      s.release();
      await settle();
      await p.flush(EMAIL, s.transport);
      expect(s.sent.map((x) => x.delta)).toEqual([1, -1]);
      expect(s.cups()).toBe(0);
    });

    // Its send acknowledged, a change that was never stored is done: still
    // counted as on its way, it would hold its day back from every flush.
    it("stops counting an acknowledged send it couldn't store", async () => {
      const s = server();
      full();
      p.record(EMAIL, DAY, 1, { send: true }, s.transport);
      await settle();
      expect(p.inFlight()).toBe(false);
      p.record(EMAIL, DAY, -1, { send: false }, s.transport);
      await settle();
      await p.flush(EMAIL, s.transport);
      expect(s.sent.map((x) => x.delta)).toEqual([1, -1]);
    });

    it("holds a later change behind one this page holds", async () => {
      const s = server();
      full();
      p.record(EMAIL, DAY, 1, { send: false }, s.transport);
      await settle();
      p.record(EMAIL, DAY, -1, { send: true }, s.transport);
      await settle();
      expect(s.transport.send).not.toHaveBeenCalled();
      expect(s.sent.map((x) => x.delta)).toEqual([1, -1]);
    });

    it("keeps the change in this page when asking for its lock throws", async () => {
      const s = server();
      const mine = await openPage({
        request: () => {
          throw new DOMException("blocked", "SecurityError");
        },
      } as unknown as LockManagerLike);
      expect(() => mine.record(EMAIL, DAY, 1, { send: false }, s.transport)).not.toThrow();
      await mine.flush(EMAIL, s.transport);
      expect(s.total()).toBe(1);
    });

    it("keeps the change in this page when its lock is refused", async () => {
      const s = server();
      const mine = await openPage({
        request: () => Promise.reject(new DOMException("blocked", "SecurityError")),
      } as unknown as LockManagerLike);
      mine.record(EMAIL, DAY, 1, { send: false }, s.transport);
      await settle();
      await mine.flush(EMAIL, s.transport);
      await mine.flush(EMAIL, s.transport);
      expect(s.total()).toBe(1);
    });
  });

  // A device that never syncs would otherwise grow the outbox for ever.
  it("keeps only the newest 500 changes", async () => {
    const s = server();
    for (let i = 0; i < 505; i++) {
      localStorage.setItem(`${PREFIX}old${i}`, JSON.stringify({ day: DAY, delta: 1, at: i }));
    }
    p.record(EMAIL, DAY, 1, { send: false }, s.transport);
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
    const c = cloud();
    orphan("x");
    const other = await openPage();
    const [mine, theirs] = [c.page(), c.page()];
    await Promise.all([p.flush(EMAIL, mine.transport), other.flush(EMAIL, theirs.transport)]);
    expect(mine.transport.recover).toHaveBeenCalledOnce();
    expect(theirs.transport.recover).not.toHaveBeenCalled(); // its claim lost
    expect(c.sent).toEqual([{ email: EMAIL, day: DAY, delta: 1, id: "x" }]);
    expect(entries()).toEqual([]);
  });

  it("is safe to call twice at once from one page", async () => {
    const s = server();
    orphan("x");
    await Promise.all([p.flush(EMAIL, s.transport), p.flush(EMAIL, s.transport)]);
    await p.flush(EMAIL, s.transport);
    expect(s.sent).toHaveLength(1);
  });

  // Another page can settle a change between this page listing it and holding
  // its lock; sending the stale copy would count it twice.
  it("doesn't send a change settled between listing it and holding its lock", async () => {
    const s = server();
    orphan("x");
    const flushing = p.flush(EMAIL, s.transport);
    localStorage.removeItem(`${PREFIX}x`); // settled elsewhere, lock since released
    await flushing;
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(s.transport.recover).not.toHaveBeenCalled();
  });

  it("leaves a change alone while a live page holds it", async () => {
    const s = server();
    orphan("x");
    const done = locks.holdAs("bookmarkdeck:hydration-op:x");
    await p.flush(EMAIL, s.transport);
    expect(s.transport.recover).not.toHaveBeenCalled();
    expect(entries()).toHaveLength(1);
    done();
    await p.flush(EMAIL, s.transport);
    expect(s.sent).toHaveLength(1);
  });

  it("doesn't resend a change another page is still sending", async () => {
    const c = cloud();
    const mine = c.page();
    const theirs = c.page();
    mine.set("hold");
    p.record(EMAIL, DAY, 1, { send: true }, mine.transport);
    await settle();
    const other = await openPage();
    await other.flush(EMAIL, theirs.transport);
    expect(theirs.transport.recover).not.toHaveBeenCalled();
    mine.release();
    await settle();
    expect(c.total()).toBe(1);
    expect(entries()).toEqual([]);
  });

  // The page's write committed but the acknowledgement never came back before
  // it closed: the receipt says so, and sending it again would count it twice.
  it("settles without sending a change whose receipt is on the server", async () => {
    const c = cloud();
    const mine = c.page();
    mine.set("lose-acks");
    p.record(EMAIL, DAY, 1, { send: true }, mine.transport);
    await settle();
    locks.crash(p.manager!);
    const next = await openPage();
    const theirs = c.page();
    await next.flush(EMAIL, theirs.transport);
    expect(theirs.transport.recover).toHaveBeenCalledOnce();
    expect(c.sent).toHaveLength(1);
    expect(entries()).toEqual([]);
  });

  it("sends a dead page's change that never reached the server", async () => {
    const c = cloud();
    const mine = c.page();
    mine.set("hold");
    p.record(EMAIL, DAY, 1, { send: true }, mine.transport);
    await settle();
    mine.drop(); // its queued write dies with it
    locks.crash(p.manager!);
    const next = await openPage();
    await next.flush(EMAIL, c.page().transport);
    expect(c.total()).toBe(1);
    expect(entries()).toEqual([]);
  });

  it("keeps a change it can't recover offline, and retries later", async () => {
    const s = server();
    orphan("x");
    s.set("offline");
    await p.flush(EMAIL, s.transport);
    expect(s.sent).toEqual([]);
    expect(entries()).toHaveLength(1);
    expect(locks.heldNames()).toEqual([]); // released for the next try
    s.set("online");
    await p.flush(EMAIL, s.transport);
    expect(s.sent).toHaveLength(1);
  });

  // A removal applied before the add it follows clamps at 0 and is lost.
  it("sends a day's changes in the order they were made", async () => {
    const s = server();
    orphan("b", -1, 20);
    orphan("a", 1, 10);
    orphan("c", 1, 30);
    await p.flush(EMAIL, s.transport);
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
    await p.flush(EMAIL, s.transport);
    expect(s.sent.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
  });

  // Two flushes at once could each hold some of a day's changes, and the later
  // change's recovery could finish first: b's gate opens before a's. A flush
  // asked for while one runs starts after it, and looks at what's stored then.
  it("runs one flush at a time, and a later one sees changes made meanwhile", async () => {
    const s = server();
    const g = gates();
    const recover = s.transport.recover;
    s.transport.recover = vi.fn(async (...args: Parameters<typeof recover>) => {
      await g.wait(args[3]);
      return recover(...args);
    });
    orphan("a", 1, 1);
    const first = p.flush(EMAIL, s.transport);
    await settle();
    orphan("b", -1, 2);
    const second = p.flush(EMAIL, s.transport); // waits for the first…
    expect(p.flush(EMAIL, s.transport)).toBe(second); // …and this one shares it
    orphan("c", 1, 3); // made before the second starts
    g.open("b");
    g.open("c");
    await settle();
    await settle();
    g.open("a");
    await first;
    await second;
    orphan("d", 1, 4);
    const third = p.flush(EMAIL, s.transport);
    expect(third).not.toBe(second);
    g.open("d");
    await third;
    expect(s.sent.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(s.cups()).toBe(2);
  });

  it("stops a day at the first change it can't recover, so none overtakes it", async () => {
    const s = server();
    orphan("a", 1, 1);
    orphan("b", -1, 2);
    vi.mocked(s.transport.recover).mockRejectedValueOnce(new Error("unavailable"));
    await p.flush(EMAIL, s.transport);
    expect(s.sent).toEqual([]);
    expect(entries()).toHaveLength(2);
    await p.flush(EMAIL, s.transport);
    expect(s.sent.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("touches only the account it is asked about", async () => {
    const s = server();
    const other = `bookmarkdeck:focus:hydration-outbox:v1:${B}:`;
    localStorage.setItem(`${other}y`, JSON.stringify({ day: DAY, delta: 1, at: 1 }));
    localStorage.setItem(`${other}z`, "{written by a later version");
    await p.flush(EMAIL, s.transport);
    p.record(EMAIL, DAY, 1, { send: false }, s.transport);
    await settle();
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(s.transport.recover).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${other}y`)).not.toBeNull();
    expect(localStorage.getItem(`${other}z`)).not.toBeNull();
  });

  // Held only in this page's memory, the account is all that keeps one
  // account's cup from being delivered under another.
  it("keeps memory-only changes, waits and flushes to their own account", async () => {
    const s = server();
    full();
    p.record(EMAIL, DAY, 1, { send: false }, s.transport);
    p.record(B, DAY, 1, { send: false }, s.transport);
    await settle();
    await p.flush(B, s.transport);
    expect(s.sent).toEqual([expect.objectContaining({ email: B, delta: 1 })]);
    const g = gates();
    const recover = s.transport.recover;
    s.transport.recover = vi.fn(async (...args: Parameters<typeof recover>) => {
      if (args[0] === EMAIL) await g.wait(EMAIL);
      return recover(...args);
    });
    const mine = p.flush(EMAIL, s.transport);
    await settle();
    p.record(B, DAY, 1, { send: false }, s.transport);
    await settle();
    await p.flush(B, s.transport); // not queued behind EMAIL's flush
    p.record(B, DAY, -1, { send: true }, s.transport); // EMAIL's waiting change isn't B's
    expect(s.transport.send).toHaveBeenCalledOnce();
    g.open(EMAIL);
    await mine;
    expect(s.sent.map((x) => x.email)).toEqual([B, B, B, EMAIL]);
  });

  it("drops a record it can't read", async () => {
    const s = server();
    localStorage.setItem(`${PREFIX}junk`, "{not json");
    localStorage.setItem(`${PREFIX}bad`, JSON.stringify({ day: "yesterday", delta: 1, at: 1 }));
    await p.flush(EMAIL, s.transport);
    expect(s.transport.recover).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${PREFIX}junk`)).toBeNull();
    expect(localStorage.getItem(`${PREFIX}bad`)).toBeNull();
  });

  // A claim used to be asked for without a guard: a lock manager that threw
  // rejected the whole flush, and the changes held only here went with it.
  it("survives a lock request that throws while it claims", async () => {
    const s = server();
    orphan("x");
    const real = locks.client() as unknown as { request: (...x: unknown[]) => Promise<unknown> };
    const mine = await openPage({
      request: (...args: unknown[]) => {
        if (typeof args[1] === "object") throw new DOMException("blocked", "SecurityError");
        return real.request(...args);
      },
    } as unknown as LockManagerLike);
    full();
    mine.record(EMAIL, DAY, 1, { send: false }, s.transport);
    await settle();
    await expect(mine.flush(EMAIL, s.transport)).resolves.toBeUndefined();
    expect(s.sent.map((x) => x.id)).not.toContain("x");
    expect(s.total()).toBe(1);
  });

  describe("a retry", () => {
    it("is due at once after a flush that left a day alone, and not after one that delivered", async () => {
      const s = server();
      s.set("hold");
      p.record(EMAIL, DAY, 1, { send: true }, s.transport);
      await settle();
      expect(p.retryDue(EMAIL)).toBe(false);
      p.record(EMAIL, DAY, 1, { send: false }, s.transport);
      await settle();
      await p.flush(EMAIL, s.transport);
      expect(p.retryDue(EMAIL)).toBe(true);
      s.release();
      await settle();
      await p.flush(EMAIL, s.transport);
      expect(p.retryDue(EMAIL)).toBe(false);
    });

    // A change the server refuses for good would otherwise be retried as often
    // as a page checks.
    it("backs off after flushes that fail, up to five minutes", async () => {
      const s = server();
      let t = 1_000_000;
      vi.spyOn(Date, "now").mockImplementation(() => t);
      orphan("x");
      s.set("offline");
      const gaps: number[] = [];
      for (let i = 0; i < 7; i++) {
        await p.flush(EMAIL, s.transport);
        const from = t;
        while (!p.retryDue(EMAIL)) t += 1_000;
        gaps.push(t - from);
      }
      expect(gaps).toEqual([15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
      s.set("online");
      await p.flush(EMAIL, s.transport);
      expect(p.retryDue(EMAIL)).toBe(false);
    });

    it("is per account", async () => {
      const s = server();
      orphan("x");
      s.set("offline");
      await p.flush(EMAIL, s.transport);
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
      expect(p.retryDue(EMAIL)).toBe(true);
      expect(p.retryDue(B)).toBe(false);
    });
  });
});

describe("hydrationWaiting", () => {
  it("is true while a day has changes this page sees no answer for", async () => {
    const s = server();
    expect(p.waiting(EMAIL, DAY)).toBe(false);
    s.set("hold");
    p.record(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    // On its way, and the page shows it already.
    expect(p.waiting(EMAIL, DAY)).toBe(false);
    p.record(EMAIL, DAY, 1, { send: false }, s.transport);
    await settle();
    expect(p.waiting(EMAIL, DAY)).toBe(true);
    expect(p.waiting(EMAIL, "2026-10-12")).toBe(false);
    expect(p.waiting(B, DAY)).toBe(false);
  });

  it("counts a change another page left behind", () => {
    localStorage.setItem(`${PREFIX}x`, JSON.stringify({ day: DAY, delta: 1, at: 1 }));
    expect(p.waiting(EMAIL, DAY)).toBe(true);
  });

  it("counts a change held only in this page", async () => {
    const s = server();
    full();
    p.record(EMAIL, DAY, 1, { send: false }, s.transport);
    await settle();
    expect(p.waiting(EMAIL, DAY)).toBe(true);
    vi.restoreAllMocks();
    await p.flush(EMAIL, s.transport);
    expect(p.waiting(EMAIL, DAY)).toBe(false);
  });
});

// Without Web Locks (an insecure context, Safari before 15.4) no page can tell
// whether another is still sending a stored change, so nothing is stored for
// another page to find: a change is sent at once, or kept in this page.
describe("without Web Locks", () => {
  beforeEach(async () => {
    p = await openPage(null);
  });

  it("sends at once and stores nothing", async () => {
    const s = server();
    p.record(EMAIL, DAY, 1, { send: true }, s.transport);
    await settle();
    expect(s.total()).toBe(1);
    expect(entries()).toEqual([]);
  });

  it("keeps an unsent change in this page, and a flush delivers it once", async () => {
    const s = server();
    p.record(EMAIL, DAY, 1, { send: false }, s.transport);
    expect(entries()).toEqual([]);
    await Promise.all([p.flush(EMAIL, s.transport), p.flush(EMAIL, s.transport)]);
    await p.flush(EMAIL, s.transport);
    expect(s.sent).toHaveLength(1);
  });

  it("never delivers a change another page stored", async () => {
    const s = server();
    localStorage.setItem(`${PREFIX}x`, JSON.stringify({ day: DAY, delta: 1, at: 1 }));
    await p.flush(EMAIL, s.transport);
    expect(s.transport.send).not.toHaveBeenCalled();
    expect(s.transport.recover).not.toHaveBeenCalled();
    expect(entries()).toHaveLength(1);
  });
});
