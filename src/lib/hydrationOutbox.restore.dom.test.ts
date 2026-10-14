import { afterEach, expect, it, vi } from "vitest";

import { webLocksMock } from "@/test/webLocksMock";
import { recordHydration } from "./hydrationOutbox";

// A file of its own: the module counts this page's unacknowledged sends, and a
// test elsewhere that kills a page leaves one counted for good.

const settle = () => new Promise((r) => setTimeout(r, 0));
const locks = webLocksMock();
afterEach(() => {
  locks.uninstall();
  vi.restoreAllMocks();
});

// A page restored from the back/forward cache may have lost its locks while
// frozen, so another page may have sent its changes since. Reloading drops this
// page's copies of them rather than sending them twice.
it("reloads a restored page while a send is unacknowledged, and not otherwise", async () => {
  locks.use(locks.client());
  const reload = vi.fn();
  vi.spyOn(window, "location", "get").mockReturnValue({ reload } as unknown as Location);
  const show = (persisted: boolean) =>
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));
  let ack = () => {};
  const transport = {
    send: vi.fn(() => new Promise<void>((r) => (ack = r))),
    receipts: vi.fn(async () => []),
  };
  recordHydration("a@example.com", "2026-10-11", 1, { send: true }, transport);
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
