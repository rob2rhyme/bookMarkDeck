import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { webLocksMock, type WebLocksMock } from "@/test/webLocksMock";

// Each test loads its own copy of the module: the restore guard and the sends
// it counts are a page's.

const settle = () => new Promise((r) => setTimeout(r, 0));
let locks: WebLocksMock;
let reload: ReturnType<typeof vi.fn>;
const show = (persisted: boolean) =>
  window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));

// Each test loads its own module, but `window` is one real jsdom window
// shared by the whole file. recordHydration's guard registers a "pageshow"
// listener on it that is never removed — by design, it's meant to live for
// the page's whole lifetime — so a test whose module never settles (its send
// never acknowledges) leaves that listener armed for every later test's own
// `show()` calls too. Tracking and removing every "pageshow" listener added
// during a test is the test-only fix: nothing in hydrationOutbox.ts changes.
let pageshowListeners: EventListenerOrEventListenerObject[] = [];
beforeEach(() => {
  localStorage.clear();
  locks = webLocksMock();
  reload = vi.fn();
  vi.spyOn(window, "location", "get").mockReturnValue({ reload } as unknown as Location);
  const realAdd = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
    if (type === "pageshow") pageshowListeners.push(listener as EventListenerOrEventListenerObject);
    return realAdd(type, listener, options);
  });
});
afterEach(() => {
  pageshowListeners.forEach((l) => window.removeEventListener("pageshow", l));
  pageshowListeners = [];
  locks.uninstall();
  vi.restoreAllMocks();
});

async function page(withLocks = true) {
  vi.resetModules();
  locks.use(withLocks ? locks.client() : null);
  return import("./hydrationOutbox");
}

// A page restored from the back/forward cache may have lost its locks while
// frozen, so another page may have sent its changes since. Reloading drops this
// page's copies of them rather than sending them twice.
it("reloads a restored page while a stored send is unacknowledged, and not otherwise", async () => {
  const mod = await page();
  let ack = () => {};
  const transport = {
    send: vi.fn(() => new Promise<void>((r) => (ack = r))),
    recover: vi.fn(async () => {}),
  };
  mod.recordHydration("a@example.com", "2026-10-11", 1, { send: true }, transport);
  await settle();
  expect(transport.send).toHaveBeenCalled();
  show(false);
  expect(reload).not.toHaveBeenCalled();
  show(true);
  expect(reload).toHaveBeenCalledTimes(1);
  ack();
  await settle();
  show(true);
  expect(reload).toHaveBeenCalledTimes(1);
});

// Without Web Locks nothing is stored, so a send in flight exists only in this
// page: a reload would lose it.
it("never reloads a page without Web Locks", async () => {
  const mod = await page(false);
  const transport = {
    send: vi.fn(() => new Promise<void>(() => {})),
    recover: vi.fn(async () => {}),
  };
  mod.recordHydration("a@example.com", "2026-10-11", 1, { send: true }, transport);
  await settle();
  show(true);
  expect(reload).not.toHaveBeenCalled();
});

// A change that couldn't be stored exists only in this page: no other page
// can have sent it, and a reload would lose it.
it("doesn't reload while a change is held only in this page", async () => {
  const mod = await page();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
  let ack = () => {};
  const transport = {
    send: vi.fn(() => new Promise<void>((r) => (ack = r))),
    recover: vi.fn(async () => {}),
  };
  mod.recordHydration("a@example.com", "2026-10-11", 1, { send: true }, transport);
  await settle();
  expect(mod.hydrationInFlight()).toBe(true);
  show(true);
  expect(reload).not.toHaveBeenCalled();
  ack();
  await settle();
});

// Two tests, deliberately in this order: the first leaves a send that never
// acknowledges — as a test that failed before calling ack() would — so its
// module's listener is still armed when the test ends. Each test loads its
// own module, but `window` is one real jsdom window for the whole file; the
// second test's own, freshly reset spy must not see the first's listener fire.
it("[setup] a page whose send never acknowledges", async () => {
  const stale = await page();
  const neverAcks = {
    send: vi.fn(() => new Promise<void>(() => {})),
    recover: vi.fn(async () => {}),
  };
  stale.recordHydration("a@example.com", "2026-10-11", 1, { send: true }, neverAcks);
  await settle();
  expect(stale.hydrationInFlight()).toBe(true);
});

it("isn't still reacting to the previous (unsettled) test's listener", () => {
  show(true);
  expect(reload).not.toHaveBeenCalled();
});
