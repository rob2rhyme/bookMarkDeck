// Every site icon in the app comes from our own route (`/api/icon`), which fetches it
// from the site through the link-title fence. It used to be Google's icon service, so
// Google saw the domain of every bookmark; the fallback asked the site itself, from the
// user's browser.

/** Our icon route for a hostname. */
export function iconPath(host: string): string {
  return `/api/icon?host=${encodeURIComponent(host.toLowerCase())}`;
}

/** Our icon route for a link's site, or null where there is no public hostname to ask. */
export function iconUrlFor(rawUrl: string): string | null {
  let host = "";
  for (const candidate of [rawUrl, `https://${rawUrl}`]) {
    try {
      host = new URL(candidate).hostname;
      break;
    } catch {
      /* try the next form */
    }
  }
  if (!host || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
  return iconPath(host);
}
