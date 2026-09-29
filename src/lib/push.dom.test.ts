import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A permission prompt must come from a click. Asked from a page-load effect,
// Firefox and Safari refuse it silently (so a digest "Scheduled" in settings
// never sends) and Chrome shows an unexplained prompt on every visit until it
// auto-blocks the origin — which also kills the prompts Focus and Habits ask
// for deliberately. schedulePush used to ask whenever permission was "default".

type Push = typeof import("./push");

const SUB = { endpoint: "https://push.example.com/abc" };
let permission: NotificationPermission;
let answer: NotificationPermission;
let requestPermission: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

async function load(): Promise<Push> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U");
  return import("./push");
}

beforeEach(() => {
  permission = "default";
  answer = "granted";
  requestPermission = vi.fn(async () => {
    permission = answer;
    return answer;
  });
  vi.stubGlobal("Notification", {
    get permission() {
      return permission;
    },
    requestPermission,
  });
  vi.stubGlobal("PushManager", function PushManager() {});
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: { getSubscription: async () => ({ toJSON: () => SUB }) },
      }),
    },
  });
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: "m1" })));
  vi.stubGlobal("fetch", fetchMock);
});

const OPTS = { endTime: Date.now() + 60_000, title: "t", body: "b", url: "/filing", tag: "filing-digest" };

describe("schedulePush", () => {
  it("never prompts on its own — permission still 'default' schedules nothing", async () => {
    const { schedulePush } = await load();
    await expect(schedulePush(OPTS)).resolves.toBeNull();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("schedules once permission is granted, carrying the tag", async () => {
    permission = "granted";
    const { schedulePush } = await load();
    await expect(schedulePush(OPTS)).resolves.toBe("m1");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.tag).toBe("filing-digest");
  });

  // The Focus start button asks and schedules in the same click: the schedule
  // must wait for the answer, or the first block after granting never alerts.
  it("waits for a prompt raised in the same click, then schedules", async () => {
    const { requestPushPermission, schedulePush } = await load();
    const asked = requestPushPermission();
    const scheduled = schedulePush(OPTS);
    await expect(asked).resolves.toBe(true);
    await expect(scheduled).resolves.toBe("m1");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("schedules nothing when that prompt is refused", async () => {
    answer = "denied";
    const { requestPushPermission, schedulePush } = await load();
    const asked = requestPushPermission();
    await expect(schedulePush(OPTS)).resolves.toBeNull();
    await expect(asked).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("requestPushPermission", () => {
  it("does not prompt again once answered", async () => {
    permission = "denied";
    const { requestPushPermission } = await load();
    await expect(requestPushPermission()).resolves.toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
  });
});

describe("usePushPermission", () => {
  it("re-renders with the answer to a prompt", async () => {
    const { requestPushPermission, usePushPermission } = await load();
    const { result } = renderHook(() => usePushPermission());
    expect(result.current).toBe("default");
    await act(async () => {
      await requestPushPermission();
    });
    expect(result.current).toBe("granted");
  });
});
