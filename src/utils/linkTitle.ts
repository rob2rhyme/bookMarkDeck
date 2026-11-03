// Client side of `/api/link-title`: one request per link per page load, and a
// failure is just "no title" — naming a bookmark is never worth an error.

const known = new Map<string, Promise<string | null>>();

export function fetchLinkTitle(url: string): Promise<string | null> {
  const hit = known.get(url);
  if (hit) return hit;
  const p = fetch(`/api/link-title?url=${encodeURIComponent(url)}`)
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json()) as { title?: unknown };
      return typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
    })
    .catch(() => null);
  known.set(url, p);
  // Not remembered if it failed: a retry later may well succeed.
  void p.then((t) => {
    if (t === null) known.delete(url);
  });
  return p;
}
