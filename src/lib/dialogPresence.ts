"use client";

// "Is some other modal dialog open?" — for UI that opens on its own (the
// first-run welcome) and must never land on top of a dialog the user opened.
//
// Read from the DOM rather than a registry because dialogs here are built two
// ways: the shared <Modal> and hand-built overlays (home, folders, habits row
// menu). Both mark themselves aria-modal="true", which is the one property they
// share. The ⌘K palette isn't aria-modal, so its own open/close event counts too.

import { useSyncExternalStore } from "react";

import { COMMAND_PALETTE_STATE_EVENT } from "@/components/CommandPalette";

const MODAL = '[aria-modal="true"]';

// Tracked from module load, not from subscribe: the palette may already be open
// by the time anything starts waiting on it.
let paletteOpen = false;
const paletteListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener(COMMAND_PALETTE_STATE_EVENT, (e) => {
    paletteOpen = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open);
    paletteListeners.forEach((l) => l());
  });
}

/** True when an aria-modal dialog (other than those matching `except`) or the palette is open. */
export function otherDialogOpen(except?: string): boolean {
  if (typeof document === "undefined") return false;
  if (paletteOpen) return true;
  const all = document.querySelectorAll(MODAL);
  return Array.from(all).some((el) => !except || !el.matches(except));
}

/** Calls `cb` whenever dialogs may have opened or closed. */
export function subscribeDialogs(cb: () => void): () => void {
  const observer = new MutationObserver(cb);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal"] });
  paletteListeners.add(cb);
  return () => {
    observer.disconnect();
    paletteListeners.delete(cb);
  };
}

const noop = () => () => {};

/**
 * Whether another dialog is open, kept current. Pass `active: false` to skip the
 * DOM observer entirely (the common case: nothing is waiting to open).
 */
export function useOtherDialogOpen(except: string, active = true): boolean {
  return useSyncExternalStore(
    active ? subscribeDialogs : noop,
    () => (active ? otherDialogOpen(except) : false),
    () => false
  );
}
