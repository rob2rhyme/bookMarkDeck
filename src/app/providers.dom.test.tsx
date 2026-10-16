import { act, render, screen } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { Providers } from "./providers";

// next-auth refetches the session each time the tab becomes visible. Offline
// that fetch fails and the session on the page becomes null — and stays null,
// since a null session is never refetched on focus. Every pillar then lost its
// account: water cups taken were recorded nowhere, and the outbox was never
// handed over when the network came back.

let online = true;
let sessionFetches = 0;

beforeEach(() => {
  online = true;
  sessionFetches = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const session = String(input).endsWith("/api/auth/session");
      if (session) sessionFetches++;
      if (!online) throw new TypeError("Failed to fetch");
      const body = session ? { user: { email: "a@example.com" }, expires: "2099-01-01T00:00:00.000Z" } : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    })
  );
  // The appearance providers read it; jsdom has none.
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false,
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { onLine?: boolean }).onLine;
  delete (document as { visibilityState?: string }).visibilityState;
});

function Account() {
  const { data } = useSession();
  return <p>{data?.user?.email ?? "signed out"}</p>;
}

const signedIn = async () => {
  render(
    <Providers>
      <Account />
    </Providers>
  );
  await screen.findByText("a@example.com");
  expect(sessionFetches).toBe(1);
};
const showTab = () =>
  act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  });

it("keeps the session when the tab is shown while offline", async () => {
  await signedIn();
  act(() => {
    online = false;
    window.dispatchEvent(new Event("offline"));
  });
  await showTab();
  expect(sessionFetches).toBe(1);
  expect(screen.getByText("a@example.com")).toBeTruthy();
});

it("refreshes the session when the tab is shown online, and again once back online", async () => {
  await signedIn();
  await showTab();
  expect(sessionFetches).toBe(2);
  act(() => {
    online = false;
    window.dispatchEvent(new Event("offline"));
  });
  act(() => {
    online = true;
    window.dispatchEvent(new Event("online"));
  });
  await showTab();
  expect(sessionFetches).toBe(3);
  expect(screen.getByText("a@example.com")).toBeTruthy();
});
