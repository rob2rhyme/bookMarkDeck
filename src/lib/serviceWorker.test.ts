import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

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

function loadWorker(windows: FakeWindow[] = []) {
  const handlers: Record<string, Handler> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => {}) },
    clients: {
      claim: vi.fn(),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => null),
    },
  };
  runInNewContext(SOURCE, { self, URL, console, Promise });

  async function dispatch(type: string, event: object) {
    const pending: Promise<unknown>[] = [];
    handlers[type]({ ...event, waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
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
});
