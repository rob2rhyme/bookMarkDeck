import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useAppLock } from "./useAppLock";

// The device privacy lock, now shared: the storage key is the only thing that makes it
// My Stuff's or Filing's, so each pillar must have its own PIN and neither may open the other.
const EMAIL = "a@example.com";
const MINE = "bookmarkdeck:inventory:lock:v1";
const OTHER = "bookmarkdeck:filing:lock:v1";

const mount = (base = MINE, email: string | null = EMAIL) => renderHook(() => useAppLock(base, email));
const ready = async (r: ReturnType<typeof mount>) => waitFor(() => expect(r.result.current.hydrated).toBe(true));

beforeEach(() => window.localStorage.clear());

describe("useAppLock", () => {
  it("is off until a PIN is set, and setting one leaves the lock open for this session", async () => {
    const lock = mount();
    await ready(lock);
    expect(lock.result.current).toMatchObject({ enabled: false, locked: false });
    await act(async () => {
      await lock.result.current.enablePin("4821");
    });
    expect(lock.result.current).toMatchObject({ enabled: true, locked: false });
  });

  it("stores a salted hash, never the PIN", async () => {
    const lock = mount();
    await ready(lock);
    await act(async () => {
      await lock.result.current.enablePin("4821");
    });
    const raw = window.localStorage.getItem(`${MINE}:${EMAIL}`) ?? "";
    expect(raw).not.toContain("4821");
    expect(JSON.parse(raw)).toMatchObject({ pinHash: expect.any(String), pinSalt: expect.any(String) });
  });

  it("locks again on the next load, and opens only for the right PIN", async () => {
    const first = mount();
    await ready(first);
    await act(async () => {
      await first.result.current.enablePin("4821");
    });
    first.unmount();

    const again = mount();
    await ready(again);
    expect(again.result.current.locked).toBe(true);
    let ok = true;
    await act(async () => {
      ok = await again.result.current.unlockWithPin("0000");
    });
    expect(ok).toBe(false);
    expect(again.result.current.locked).toBe(true);
    await act(async () => {
      ok = await again.result.current.unlockWithPin("4821");
    });
    expect(ok).toBe(true);
    expect(again.result.current.locked).toBe(false);
  });

  it("Lock now re-locks; turning it off reveals and forgets the PIN", async () => {
    const lock = mount();
    await ready(lock);
    await act(async () => {
      await lock.result.current.enablePin("4821");
    });
    act(() => lock.result.current.lockNow());
    expect(lock.result.current.locked).toBe(true);
    act(() => lock.result.current.disable());
    expect(lock.result.current).toMatchObject({ enabled: false, locked: false });
    expect(window.localStorage.getItem(`${MINE}:${EMAIL}`)).toBeNull();
  });

  it("each storage base has its own PIN: one pillar's lock neither exists in nor opens the other's", async () => {
    const mine = mount(MINE);
    await ready(mine);
    await act(async () => {
      await mine.result.current.enablePin("4821");
    });
    mine.unmount();

    const other = mount(OTHER);
    await ready(other);
    expect(other.result.current).toMatchObject({ enabled: false, locked: false });
    await act(async () => {
      await other.result.current.enablePin("9999");
    });
    other.unmount();

    const mineAgain = mount(MINE);
    await ready(mineAgain);
    let ok = true;
    await act(async () => {
      ok = await mineAgain.result.current.unlockWithPin("9999"); // the OTHER pillar's PIN
    });
    expect(ok).toBe(false);
  });

  it("is per account", async () => {
    const a = mount(MINE, "a@example.com");
    await ready(a);
    await act(async () => {
      await a.result.current.enablePin("4821");
    });
    a.unmount();
    const b = mount(MINE, "b@example.com");
    await ready(b);
    expect(b.result.current.enabled).toBe(false);
  });
});
