import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const flags = { cached: false, cloud: false };
const markUiFlag = vi.fn();
vi.mock("@/lib/uiPrefs", () => ({
  getCachedFlag: () => flags.cached,
  fetchUiFlag: async () => flags.cloud,
  markUiFlag: (...a: unknown[]) => markUiFlag(...a),
}));

import { COMMAND_PALETTE_STATE_EVENT } from "@/components/CommandPalette";
import { Onboarding, SETTLE_MS } from "./Onboarding";

// A direct DOM query, not a role query: with another aria-modal dialog present,
// Testing Library treats everything outside it as inaccessible, so a role query
// reports the welcome as absent even when it's on screen — the very overlap this
// file exists to catch.
const welcome = () => document.querySelector('[aria-labelledby="onboarding-title"]');

/** A hand-built dialog like the home page's — not the shared Modal. */
function openOtherDialog(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Set a passphrase");
  document.body.appendChild(el);
  return el;
}

async function settle(ms = SETTLE_MS + 50) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Long enough for the cloud check, a render and the pause — several times over. */
async function waitLong() {
  for (let i = 0; i < 8; i++) await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  flags.cached = false;
  flags.cloud = false;
  markUiFlag.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  document.querySelectorAll('[aria-label="Set a passphrase"]').forEach((el) => el.remove());
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_STATE_EVENT, { detail: { open: false } }));
});

describe("Onboarding (first-run welcome)", () => {
  it("shows on a first run once the page is dialog-free, and is then marked seen", async () => {
    render(<Onboarding />);
    await settle(10);
    expect(welcome()).toBeNull(); // not before the settle pause
    expect(markUiFlag).not.toHaveBeenCalled();
    await settle();
    expect(welcome()).not.toBeNull();
    expect(markUiFlag).toHaveBeenCalledWith("welcomeSeen");
  });

  it("never opens over another dialog — it waits until that one closes", async () => {
    const other = openOtherDialog();
    render(<Onboarding />);
    await waitLong();
    expect(welcome()).toBeNull();
    expect(markUiFlag).not.toHaveBeenCalled(); // not "seen" if it never showed
    await act(async () => other.remove());
    await settle();
    expect(welcome()).not.toBeNull();
  });

  it("doesn't slip in between two dialogs that replace each other", async () => {
    const first = openOtherDialog();
    render(<Onboarding />);
    await settle();
    await act(async () => first.remove());
    await settle(SETTLE_MS / 2);
    const second = openOtherDialog(); // e.g. a confirm right after a form
    await waitLong();
    expect(welcome()).toBeNull();
    await act(async () => second.remove());
    await settle();
    expect(welcome()).not.toBeNull();
  });

  it("waits for the ⌘K palette too, which isn't an aria-modal dialog", async () => {
    window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_STATE_EVENT, { detail: { open: true } }));
    render(<Onboarding />);
    await waitLong();
    expect(welcome()).toBeNull();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_STATE_EVENT, { detail: { open: false } }));
    });
    await settle();
    expect(welcome()).not.toBeNull();
  });

  it("stays open once shown, even if something else appears", async () => {
    render(<Onboarding />);
    await settle();
    await settle();
    expect(welcome()).not.toBeNull();
    await act(async () => {
      openOtherDialog();
    });
    await settle();
    expect(welcome()).not.toBeNull();
  });

  it("never shows for a returning user", async () => {
    flags.cached = true;
    render(<Onboarding />);
    await waitLong();
    expect(welcome()).toBeNull();
    flags.cached = false;
    flags.cloud = true; // evicted cache, but the cloud remembers
    render(<Onboarding />);
    await waitLong();
    expect(welcome()).toBeNull();
  });
});
