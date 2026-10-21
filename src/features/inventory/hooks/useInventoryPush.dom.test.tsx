import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `pushEnabled` syncs across devices and this effect runs on every visit to
// /inventory, so it must schedule only where THIS device has granted permission.
let permission: NotificationPermission | "unsupported" = "default";
vi.mock("@/lib/push", () => ({
  schedulePush: vi.fn(async () => "m1"),
  cancelPush: vi.fn(async () => {}),
  usePushPermission: () => permission,
}));

import { cancelPush, schedulePush } from "@/lib/push";
import type { InventoryItem } from "@/features/inventory/lib/types";
import { attention } from "@/features/inventory/lib/value";
import { useInventoryPush } from "./useInventoryPush";

const empty = attention([], "2026-06-15");
const due = { ...empty, useByExpired: [{ id: "1", name: "Milk" } as InventoryItem] };

const mount = (over: Partial<Parameters<typeof useInventoryPush>[0]> = {}) =>
  renderHook(() =>
    useInventoryPush({
      email: "a@example.com",
      enabled: true,
      hour: 9,
      attention: due,
      ready: true,
      ...over,
    })
  );

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(schedulePush).mockClear();
  vi.mocked(cancelPush).mockClear();
});

describe("useInventoryPush", () => {
  it.each(["default", "denied", "unsupported"] as const)(
    "schedules nothing while this device's permission is %s",
    async (state) => {
      permission = state;
      mount();
      await new Promise((r) => setTimeout(r, 20));
      expect(schedulePush).not.toHaveBeenCalled();
    }
  );

  it("schedules the digest, tagged and routed to My Stuff, once permission is granted", async () => {
    permission = "granted";
    mount();
    await waitFor(() => expect(schedulePush).toHaveBeenCalledTimes(1));
    expect(vi.mocked(schedulePush).mock.calls[0][0]).toMatchObject({
      url: "/inventory",
      tag: "inventory-digest",
      title: "1 item past use-by",
      body: "Milk",
    });
  });

  it("waits until the items have loaded", async () => {
    permission = "granted";
    mount({ ready: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(schedulePush).not.toHaveBeenCalled();
  });

  it("cancels the queued message when nothing needs attention any more", async () => {
    permission = "granted";
    window.localStorage.setItem("bookmarkdeck:inventory:push-message:v1:a@example.com", "old");
    mount({ attention: empty });
    await waitFor(() => expect(cancelPush).toHaveBeenCalledWith("old"));
    expect(schedulePush).not.toHaveBeenCalled();
  });

  it("keeps item names out of a locked app's notification", async () => {
    permission = "granted";
    mount({ nameItems: false });
    await waitFor(() => expect(schedulePush).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(vi.mocked(schedulePush).mock.calls[0][0])).not.toContain("Milk");
  });
});
