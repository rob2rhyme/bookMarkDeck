// Cross-feature handoff: the command palette lives in the shared shell and must
// not import feature code, so it writes an intent here and routes to /filing;
// the Filing dashboard consumes it. Mirrors focusIntent.ts.
//
// The palette also dispatches NUDGE after routing, because Next won't remount
// the dashboard when you're already on /filing — without it, ⌘K from the Filing
// page itself would set an intent nothing picks up until the next visit.

export type FilingIntent = "add-paper" | "where-is-it";

const KEY = "bd:intent:filing";

/** Fired by the palette after routing, so an already-mounted dashboard reacts. */
export const FILING_INTENT_NUDGE = "bd:intent:filing:nudge";

export function setFilingIntent(intent: FilingIntent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, intent);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(FILING_INTENT_NUDGE));
}

/** Read and clear. Clearing on read is what stops a stale intent re-firing. */
export function consumeFilingIntent(): FilingIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(KEY);
    if (value) window.localStorage.removeItem(KEY);
    return value === "add-paper" || value === "where-is-it" ? value : null;
  } catch {
    return null;
  }
}
