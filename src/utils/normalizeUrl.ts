// Normalize a user-typed bookmark/shortcut URL before it is stored or opened.
//
// Two jobs:
//  1. Safety — only http/https are allowed through. A pasted `javascript:` or
//     `data:` URL would otherwise be stored and later rendered as an `<a href>`
//     / passed to window.open, i.e. a self-XSS foot-gun. Those (and any other
//     scheme) normalize to "" so callers can reject them.
//  2. UX — a schemeless entry like `example.com` is made absolute (`https://…`)
//     so it opens as a real URL instead of a relative path off the app origin.
//
// Returns "" for empty input or a blocked scheme; the caller should treat "" as
// "not a usable URL" (skip the add / skip the open).

/**
 * A URL that runs code or carries a document when opened: `javascript:`,
 * `data:`, `vbscript:`. Narrower than normalizeUrl on purpose — it is for STORED
 * links (imports, cache, cloud), where an app scheme like `obsidian://` is a
 * legitimate shortcut that normalizeUrl would reject. Leading whitespace and
 * control characters are ignored, as browsers ignore them when navigating.
 */
export function isUnsafeUrl(raw: string): boolean {
  const s = (raw ?? "").replace(/[\u0000-\u0020]/g, "").toLowerCase();
  return s.startsWith("javascript:") || s.startsWith("data:") || s.startsWith("vbscript:");
}

export function normalizeUrl(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";

  // Protocol-relative (`//host/…`) → assume https.
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme === "http" || scheme === "https") return trimmed;
    // Unsafe or unsupported scheme (javascript:, data:, vbscript:, file:, …).
    return "";
  }

  // Schemeless (bare host or path) → absolute https so it never opens relative.
  return `https://${trimmed}`;
}
