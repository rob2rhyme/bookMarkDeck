import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `pushEnabled` syncs across devices and this hook's effect runs on every visit
// to /filing. It used to schedule regardless of THIS device's permission, and
// scheduling was what raised the prompt — so a setting ticked on a laptop
// prompted on the phone at page load, with no click, every visit.
let permission: NotificationPermission | "unsupported" = "default";
vi.mock("@/lib/push", () => ({
  schedulePush: vi.fn(async () => "m1"),
  cancelPush: vi.fn(async () => {}),
  usePushPermission: () => permission,
}));
vi.mock("@/features/filing/lib/digest", () => ({
  buildDigest: () => ({ count: 2, title: "2 things need attention", body: "Renew passport" }),
  msUntilHour: () => 60_000,
}));

import { schedulePush } from "@/lib/push";
import { useFilingPush } from "./useFilingPush";

const mount = () =>
  renderHook(() =>
    useFilingPush({
      email: "a@example.com",
      enabled: true,
      hour: 9,
      due: [],
      shred: [],
      custody: [],
      ready: true,
    })
  );

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(schedulePush).mockClear();
});

describe("useFilingPush", () => {
  it.each(["default", "denied", "unsupported"] as const)(
    "schedules nothing while this device's permission is %s",
    async (state) => {
      permission = state;
      mount();
      await new Promise((r) => setTimeout(r, 20));
      expect(schedulePush).not.toHaveBeenCalled();
    }
  );

  it("schedules the digest, tagged as the digest, once permission is granted", async () => {
    permission = "granted";
    mount();
    await waitFor(() => expect(schedulePush).toHaveBeenCalledTimes(1));
    expect(vi.mocked(schedulePush).mock.calls[0][0]).toMatchObject({
      url: "/filing",
      tag: "filing-digest",
    });
  });
});
