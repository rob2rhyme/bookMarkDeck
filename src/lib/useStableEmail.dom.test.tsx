import { act, renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));

import { useStableEmail } from "./useStableEmail";

const EMAIL = "a@example.com";
let online = true;

function sessionOf(email: string | null) {
  return { data: email ? { user: { email }, expires: "2099-01-01T00:00:00.000Z" } : null };
}

beforeEach(() => {
  online = true;
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
});
afterEach(() => {
  delete (navigator as { onLine?: boolean }).onLine;
  vi.mocked(useSession).mockReset();
});

// next-auth's cross-tab broadcast nulls the session in every other open tab
// after any fetch, a failed one included — not only this tab's own focus
// refetch, which providers.tsx already guards. The email this hook returns
// must survive that transient null while the device knows it is offline.
it("keeps the email through a null session while offline", () => {
  vi.mocked(useSession).mockReturnValue(sessionOf(EMAIL) as ReturnType<typeof useSession>);
  const { result, rerender } = renderHook(() => useStableEmail());
  expect(result.current).toBe(EMAIL);

  online = false;
  vi.mocked(useSession).mockReturnValue(sessionOf(null) as ReturnType<typeof useSession>);
  rerender();
  expect(result.current).toBe(EMAIL);

  // Back online, and the session answers again: the live value returns.
  online = true;
  vi.mocked(useSession).mockReturnValue(sessionOf(EMAIL) as ReturnType<typeof useSession>);
  rerender();
  expect(result.current).toBe(EMAIL);
});

it("lets a null through as a real sign-out while online", () => {
  vi.mocked(useSession).mockReturnValue(sessionOf(EMAIL) as ReturnType<typeof useSession>);
  const { result, rerender } = renderHook(() => useStableEmail());
  expect(result.current).toBe(EMAIL);

  vi.mocked(useSession).mockReturnValue(sessionOf(null) as ReturnType<typeof useSession>);
  rerender();
  expect(result.current).toBeNull();
});

// next-auth's own `online` handling only gates an unconfigured
// refetchInterval poll — it never itself refetches the session. Keying the
// hold-the-last-email effect on `online` let a real browser 'online' event,
// fired while the session is still the offline-suppressed null, null the
// stable email right at reconnect, before any refetch happens.
it("doesn't let a real 'online' event null the email while the session is still the stale offline null", () => {
  vi.mocked(useSession).mockReturnValue(sessionOf(EMAIL) as ReturnType<typeof useSession>);
  const { result, rerender } = renderHook(() => useStableEmail());
  expect(result.current).toBe(EMAIL);

  online = false;
  vi.mocked(useSession).mockReturnValue(sessionOf(null) as ReturnType<typeof useSession>);
  rerender();
  expect(result.current).toBe(EMAIL);

  // Connectivity returns — a real browser event, not just a rerender — but
  // the session mock is deliberately left untouched: next-auth would not
  // have refetched yet either.
  online = true;
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
  expect(result.current).toBe(EMAIL);
});

it("starts null before the first session answer, even offline", () => {
  online = false;
  vi.mocked(useSession).mockReturnValue(sessionOf(null) as ReturnType<typeof useSession>);
  const { result } = renderHook(() => useStableEmail());
  expect(result.current).toBeNull();
});
