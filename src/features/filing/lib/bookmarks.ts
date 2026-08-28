// The connection that earns this pillar its place (ANALYSIS-FILING-LOG.md §2).
//
// The insurance policy in Drawer 2 and the insurer's login page are one record:
// a paper links to the bookmark for the account it belongs to, so "where is it?"
// answers for the physical and digital halves at once.
//
// Bookmarks are CORE app data (src/types/bookmark.ts, src/hooks/useBookmarks.ts),
// not another feature, so reading them doesn't break the no-feature-imports rule.
// But we read the localStorage cache rather than mounting useBookmarks: that hook
// owns sync, migration and write paths this feature has no business touching, and
// a second subscription to the same data is a bug waiting to happen. Reading a
// cache is a one-way, read-only dependency — delete src/features/filing and
// nothing about bookmarks changes.
//
// Pure apart from the single localStorage read. See bookmarks.test.ts.

/** The shape this feature needs — deliberately narrower than core's Bookmark. */
export type LinkableBookmark = {
  id: string;
  title: string;
  url: string;
};

// Must match storageKeyV2ForUser in src/hooks/useBookmarks.ts.
const BOOKMARKS_KEY_V2 = "bookmarkdeck:v2";

export function bookmarksKey(email?: string | null): string {
  return email ? `${BOOKMARKS_KEY_V2}:${email}` : BOOKMARKS_KEY_V2;
}

/** Keep only records that can actually be linked and opened. */
export function normalizeBookmarks(raw: unknown): LinkableBookmark[] {
  if (!Array.isArray(raw)) return [];
  const out: LinkableBookmark[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, title, url } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id) continue;
    if (typeof url !== "string" || !url) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: typeof title === "string" && title.trim() ? title.trim() : url,
      url,
    });
  }
  return out;
}

/** Read the core bookmarks cache. Returns [] rather than throwing, always. */
export function readBookmarks(email?: string | null): LinkableBookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(bookmarksKey(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { bookmarks?: unknown };
    return normalizeBookmarks(parsed?.bookmarks);
  } catch {
    return [];
  }
}

/** The bit of a URL a person recognises: host without www, no scheme. */
export function displayHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}

/**
 * Rank bookmarks against a query. Title match beats host match, and a prefix
 * beats a match in the middle — so typing "geico" puts the GEICO login above a
 * page that merely mentions it.
 */
export function searchBookmarks(
  bookmarks: LinkableBookmark[],
  query: string,
  limit = 8
): LinkableBookmark[] {
  const q = query.trim().toLowerCase();
  if (!q) return bookmarks.slice(0, limit);

  const scored: { bookmark: LinkableBookmark; score: number }[] = [];
  for (const bookmark of bookmarks) {
    const title = bookmark.title.toLowerCase();
    const host = displayHost(bookmark.url).toLowerCase();
    let score = 0;
    if (title === q) score = 100;
    else if (title.startsWith(q)) score = 80;
    else if (title.includes(q)) score = 60;
    else if (host.startsWith(q)) score = 50;
    else if (host.includes(q)) score = 40;
    else if (bookmark.url.toLowerCase().includes(q)) score = 20;
    if (score > 0) scored.push({ bookmark, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.bookmark.title.localeCompare(b.bookmark.title))
    .slice(0, limit)
    .map((s) => s.bookmark);
}

/**
 * Suggest a bookmark for a paper by matching its words against titles and hosts.
 * Only confident hits — a wrong suggestion costs more than no suggestion, since
 * accepting one silently attaches the wrong account to the paper.
 */
export function suggestForTitle(
  bookmarks: LinkableBookmark[],
  title: string
): LinkableBookmark | null {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4); // "auto", "tax" — shorter words match noise
  if (words.length === 0) return null;

  for (const word of words) {
    const hits = searchBookmarks(bookmarks, word, 2);
    if (hits.length === 1) return hits[0];
  }
  return null;
}
