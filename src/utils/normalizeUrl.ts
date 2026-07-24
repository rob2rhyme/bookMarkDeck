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
