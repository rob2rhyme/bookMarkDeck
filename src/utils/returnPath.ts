// Where to land after signing in. The gate sends a signed-out visitor to
// /login?callbackUrl=<the page they asked for> — an absolute URL — and login
// used to ignore it, so a link shared into the app while signed out was lost.
// Only a page on this site is honoured: anything else (another origin, a
// protocol-relative or backslash path that browsers read as another host)
// lands on the home page, so the parameter can't become an open redirect.

export function returnPath(raw: string | null | undefined, origin: string): string {
  if (!raw || raw.includes("\\")) return "/";
  try {
    const target = new URL(raw, origin);
    if (target.origin !== origin) return "/";
    const path = `${target.pathname}${target.search}`;
    return path.startsWith("/login") ? "/" : path.slice(0, 2048);
  } catch {
    return "/";
  }
}
