import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

import { SNOOZE_CACHE } from "@/lib/snoozeRecords";

// public/sw.js is a plain script the browser loads, so nothing imports it and no
// other test reaches it. This loads the real file into a sandbox with fake
// worker globals and dispatches events at it — it only became reachable once
// #316 let push through the middleware, and its bugs only showed up then.
const SOURCE = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const ORIGIN = "https://app.example.com";

type Handler = (event: unknown) => void;
type FakeWindow = {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
};

function windowAt(path: string, { controlled = true } = {}): FakeWindow {
  const win: FakeWindow = {
    url: `${ORIGIN}${path}`,
    focus: vi.fn(async () => win),
    // WindowClient.navigate rejects for a window this worker doesn't control.
    navigate: vi.fn(async (href: string) => {
      if (!controlled) throw new TypeError("not controlled");
      win.url = href;
      return win;
    }),
  };
  return win;
}

/** Cache Storage with the spec's ordering: keys() in insertion order, and put()
 *  replacing an entry moves it to the end. */
function fakeCaches() {
  const entries = new Map<string, unknown>();
  const keyOf = (r: string | { url: string }) =>
    new URL(typeof r === "string" ? r : r.url, ORIGIN).href;
  const cache = {
    match: async (r: string | { url: string }) => entries.get(keyOf(r)),
    put: async (r: string | { url: string }, res: unknown) => {
      entries.delete(keyOf(r));
      entries.set(keyOf(r), res);
    },
    add: async (r: string) => {
      entries.set(keyOf(r), { ok: true });
    },
    delete: async (r: string | { url: string }) => entries.delete(keyOf(r)),
    keys: async () => [...entries.keys()].map((url) => ({ url })),
  };
  return {
    entries,
    storage: {
      open: async () => cache,
      keys: async () => [] as string[],
      delete: async () => true,
    },
  };
}

function loadWorker(
  windows: FakeWindow[] = [],
  {
    caches = fakeCaches().storage,
    fetch = vi.fn(),
    subscription = null,
  }: { caches?: unknown; fetch?: unknown; subscription?: unknown } = {}
) {
  const handlers: Record<string, Handler> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    skipWaiting: vi.fn(),
    registration: {
      showNotification: vi.fn(async () => {}),
      pushManager: { getSubscription: vi.fn(async () => subscription) },
    },
    clients: {
      claim: vi.fn(),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => null),
    },
  };
  runInNewContext(SOURCE, { self, caches, fetch, URL, console, Promise, Response });

  async function dispatch(type: string, event: object) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<unknown> | undefined;
    let dispatching = true;
    handlers[type]({
      ...event,
      // Stricter than a browser, on purpose: a real FetchEvent throws on a
      // waitUntil made once its other promises have settled, which is exactly
      // when a cache hit's revalidation runs. Only a call made during dispatch
      // is always safe.
      waitUntil: (p: Promise<unknown>) => {
        if (!dispatching) throw new Error("InvalidStateError: waitUntil after dispatch");
        pending.push(p);
      },
      respondWith: (p: Promise<unknown>) => {
        response = p;
        pending.push(p);
      },
    });
    dispatching = false;
    await Promise.all(pending);
    // A response's background revalidation settles after respondWith does.
    await new Promise((r) => setTimeout(r, 0));
    return response;
  }
  return { self, dispatch };
}

async function push(payload: object) {
  const worker = loadWorker();
  await worker.dispatch("push", { data: { json: () => payload } });
  const [title, options] = worker.self.registration.showNotification.mock.calls[0] as unknown as [
    string,
    { tag: string; badge: string; data: { url: string } },
  ];
  return { title, options };
}

async function click(url: string, windows: FakeWindow[]) {
  const worker = loadWorker(windows);
  await worker.dispatch("notificationclick", {
    notification: { close: vi.fn(), data: { url } },
  });
  return worker.self.clients.openWindow;
}

describe("push", () => {
  it("shows the tag the payload carries, so pillars don't replace each other", async () => {
    const { options } = await push({ title: "🏃 Run", url: "/habits", tag: "habit:h1" });
    expect(options.tag).toBe("habit:h1");
  });

  it("falls back to the timer's tag for a message queued before tags existed", async () => {
    const { options } = await push({ title: "Time's up" });
    expect(options.tag).toBe("bmd-focus-timer");
  });

  // Android draws the status-bar badge from the alpha channel alone, so the
  // opaque full-colour icon came out as a solid white square.
  it("uses the monochrome badge, not the opaque app icon", async () => {
    const { options } = await push({ title: "x" });
    expect(options.badge).toBe("/icons/badge-96.png");
  });
});

describe("snooze action", () => {
  const reminder = {
    title: "Stretch",
    body: "Time for Stretch.",
    url: "/habits",
    tag: "habit:h1",
    snooze: true,
  };
  const SUB = { endpoint: "https://fcm.googleapis.com/x", toJSON: () => ({ endpoint: "https://fcm.googleapis.com/x" }) };

  async function clickSnooze(opts: { fetch: unknown; windows?: FakeWindow[]; subscription?: unknown }) {
    const store = fakeCaches();
    const worker = loadWorker(opts.windows ?? [], {
      caches: store.storage,
      fetch: opts.fetch,
      subscription: "subscription" in opts ? opts.subscription : SUB,
    });
    await worker.dispatch("push", { data: { json: () => reminder } });
    const [, options] = worker.self.registration.showNotification.mock.calls[0] as unknown as [
      string,
      { actions?: { action: string; title: string }[]; data: object },
    ];
    await worker.dispatch("notificationclick", {
      action: "snooze",
      notification: { close: vi.fn(), data: options.data },
    });
    return { worker, store, options };
  }

  it("offers the action only on a message that asked for it", async () => {
    const plain = await push({ title: "x", tag: "filing-digest" });
    expect((plain.options as { actions?: unknown }).actions).toBeUndefined();
    const { options } = await clickSnooze({ fetch: vi.fn(async () => ({ ok: true, json: async () => ({ messageId: "m2" }) })) });
    expect(options.actions).toEqual([{ action: "snooze", title: "Snooze 1 hour" }]);
  });

  it("queues the same notification an hour out, records it, and opens nothing", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ messageId: "m2" }) }));
    const { worker, store } = await clickSnooze({ fetch });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/push/schedule");
    expect(JSON.parse(init.body)).toMatchObject({
      delaySec: 3600,
      title: "Stretch",
      body: "Time for Stretch.",
      url: "/habits",
      tag: "habit:h1",
      snooze: true,
    });
    expect(worker.self.clients.openWindow).not.toHaveBeenCalled();
    const saved = store.entries.get(`${ORIGIN}/__snooze/habit%3Ah1`) as Response;
    expect(await saved.json()).toMatchObject({ tag: "habit:h1", messageId: "m2" });
  });

  it.each([
    ["the server refuses", { fetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })), subscription: SUB }],
    ["there is no push subscription", { fetch: vi.fn(), subscription: null }],
  ])("opens the app instead when %s", async (_label, opts) => {
    const { worker } = await clickSnooze(opts);
    expect(worker.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/habits`);
  });

  it("keeps its cache name in step with the page's reader, and out of activate's cleanup", () => {
    expect(SOURCE).toContain(`const SNOOZE_CACHE = "${SNOOZE_CACHE}"`);
    expect(SOURCE).toContain("k !== SNOOZE_CACHE");
  });
});

describe("notificationclick", () => {
  it("focuses a window already on the target page", async () => {
    const win = windowAt("/habits");
    const openWindow = await click("/habits", [win]);
    expect(win.focus).toHaveBeenCalled();
    expect(win.navigate).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  // The old substring match treated /habits/guide as "already on /habits" and
  // focused it without navigating, leaving the user on the guide.
  it("navigates a window on a different page, even one whose path contains the target", async () => {
    const win = windowAt("/habits/guide");
    const openWindow = await click("/habits", [win]);
    expect(win.navigate).toHaveBeenCalledWith(`${ORIGIN}/habits`);
    expect(win.focus).toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("prefers the exact page over another open window", async () => {
    const other = windowAt("/focus");
    const exact = windowAt("/filing");
    await click("/filing", [other, exact]);
    expect(exact.focus).toHaveBeenCalled();
    expect(other.navigate).not.toHaveBeenCalled();
  });

  it("opens a new window when the only window can't be navigated", async () => {
    const win = windowAt("/focus", { controlled: false });
    const openWindow = await click("/filing", [win]);
    expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/filing`);
  });

  it("opens a new window when none is open", async () => {
    const openWindow = await click("/focus", []);
    expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/focus`);
  });

  it.each([
    ["a backslash path", "/\\evil.example/x"],
    ["an absolute URL", "https://evil.example/x"],
    ["a protocol-relative URL", "//evil.example/x"],
  ])("never leaves the app for %s", async (_label, url) => {
    const openWindow = await click(url, []);
    expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });
});

describe("static asset cache", () => {
  const ok = () => ({ ok: true, redirected: false, clone: () => ({ ok: true }) });
  const asset = (path: string) => ({ method: "GET", mode: "no-cors", url: `${ORIGIN}${path}` });

  async function fetchAll(paths: string[], response: () => unknown = ok) {
    const { entries, storage } = fakeCaches();
    await storage.open().then((c) => c.add("/offline.html"));
    const worker = loadWorker([], { caches: storage, fetch: vi.fn(async () => response()) });
    for (const path of paths) await worker.dispatch("fetch", { request: asset(path) });
    return [...entries.keys()].map((url) => new URL(url).pathname);
  }

  const chunks = Array.from({ length: 300 }, (_, i) => `/_next/static/chunks/${i}.js`);

  // Every deploy ships new content-hashed chunks and nothing ever removed the
  // old ones: tens of MB over months for a daily user, never read again.
  it("stays bounded across many builds' chunks, dropping the oldest first", async () => {
    const kept = await fetchAll(chunks);
    expect(kept.length).toBeLessThanOrEqual(250);
    expect(kept).toContain("/_next/static/chunks/299.js");
    expect(kept).not.toContain("/_next/static/chunks/0.js");
  });

  it("answers a cache miss with the network response", async () => {
    const fresh = { ok: true, redirected: false, clone: () => ({}) };
    const worker = loadWorker([], { fetch: vi.fn(async () => fresh) });
    const answered = await worker.dispatch("fetch", { request: asset("/icons/icon-512.png") });
    expect(answered).toBe(fresh);
  });

  it("revalidates an asset it already holds", async () => {
    const { entries, storage } = fakeCaches();
    const url = `${ORIGIN}/icons/icon-192.png`;
    entries.set(url, { stale: true });
    const fresh = { ok: true, redirected: false, clone: () => ({ fresh: true }) };
    const worker = loadWorker([], { caches: storage, fetch: vi.fn(async () => fresh) });
    await worker.dispatch("fetch", { request: asset("/icons/icon-192.png") });
    expect(entries.get(url)).toEqual({ fresh: true });
  });

  it("never evicts the offline page", async () => {
    expect(await fetchAll(chunks)).toContain("/offline.html");
  });

  // An asset bounced to /login arrives ok:true with the login HTML; caching it
  // would serve that page as the asset from then on (#316).
  it("never caches a response that arrived via a redirect", async () => {
    const redirected = () => ({ ok: true, redirected: true, clone: () => ({}) });
    expect(await fetchAll(["/icons/icon-192.png"], redirected)).not.toContain(
      "/icons/icon-192.png"
    );
  });
});
