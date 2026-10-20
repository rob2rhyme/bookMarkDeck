"use client";

// Clipboard access for Notes. Inside the Capacitor iOS shell, the native
// @capacitor/clipboard plugin; on the web, navigator.clipboard.
//
// The native path FALLS BACK on any failure rather than giving up: the shell
// loads the live site (capacitor.config.ts), so a deploy reaches devices before
// a rebuilt app does. Until `npx cap sync ios` ships the plugin in the binary,
// isNativePlatform() is true but the plugin call rejects as unimplemented — and
// WKWebView's own navigator.clipboard still works for a button tap.
//
// Capacitor is imported dynamically so it never enters the server bundle, as in
// features/focus/lib/nativeNotify.ts.

async function nativeClipboard() {
  if (typeof window === "undefined") return null;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { Clipboard } = await import("@capacitor/clipboard");
    return Clipboard;
  } catch {
    return null;
  }
}

/** Copy `text`. Resolves true on success; never throws. */
export async function copyText(text: string): Promise<boolean> {
  const native = await nativeClipboard();
  if (native) {
    try {
      await native.write({ string: text });
      return true;
    } catch {
      /* fall through to the web API */
    }
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  return legacyCopy(text);
}

/**
 * The clipboard's text, "" when it holds none, or null when it can't be read
 * (permission refused, API missing). Must be called from a user gesture on the web.
 */
export async function readText(): Promise<string | null> {
  const native = await nativeClipboard();
  if (native) {
    try {
      const { type, value } = await native.read();
      // Non-text content (an image) comes back as a data URL — not a note.
      if (type && !type.startsWith("text")) return "";
      return value ?? "";
    } catch {
      /* fall through to the web API */
    }
  }
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch {
    /* permission refused */
  }
  return null;
}

/** Older WebViews without the async Clipboard API. */
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.className = "fixed -left-[9999px] top-0 opacity-0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}
