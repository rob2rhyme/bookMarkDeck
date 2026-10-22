import { renderHook } from "@testing-library/react";
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

it("starts null before the first session answer, even offline", () => {
  online = false;
  vi.mocked(useSession).mockReturnValue(sessionOf(null) as ReturnType<typeof useSession>);
  const { result } = renderHook(() => useStableEmail());
  expect(result.current).toBeNull();
});
