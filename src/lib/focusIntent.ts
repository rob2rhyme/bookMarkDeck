// Cross-feature handoff: a bookmark can seed a Focus task. The home page writes
// an intent to localStorage and routes to /focus; the Focus hub consumes it on
// mount (creating + activating the task), keeping the two features decoupled.

const KEY = "bd:intent:focus-task";

export function setFocusTaskIntent(title: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, title);
  } catch {
    /* ignore */
  }
}

export function consumeFocusTaskIntent(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(KEY);
    if (value) window.localStorage.removeItem(KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}
