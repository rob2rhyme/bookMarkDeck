// Smart auto-organize for bookmarks + folders. Pure (no React/Firebase) so it's
// easy to test and reason about. Produces a PLAN the UI previews + tweaks before
// applying — nothing here mutates anything.
//
// Strategy (folder-first, so a big already-filed library isn't torn apart):
//   • Merge exact-duplicate folders into the fullest survivor.
//   • Nest messy TOP-LEVEL folders under a badged category parent — inferred
//     from the folder's name, else the dominant category of its bookmarks. The
//     folder (and its contents) move intact; nothing inside is reshuffled.
//   • Refile only LOOSE (unfiled) bookmarks into the matching category parent.
//   • Anything we can't categorize is left exactly where it is.

import type { Bookmark } from "@/types/bookmark";
import type { Folder } from "@/types/folder";

export type Category = {
  name: string;
  emoji: string;
  domains: string[]; // matched as the registrable domain or a subdomain of it
  brands?: string[]; // matched as an exact hostname label (covers multi-TLD brands)
  keywords?: string[]; // matched in a bookmark's title/url
  aliases?: string[]; // single words matched against a folder's NAME
};

// Order matters — the first matching category wins, so put the more specific
// ones (AI before Dev) first.
export const CATEGORIES: readonly Category[] = [
  { name: "AI", emoji: "🤖", domains: ["openai.com", "chatgpt.com", "claude.ai", "anthropic.com", "huggingface.co", "perplexity.ai", "midjourney.com", "gemini.google.com", "replicate.com"], keywords: ["chatgpt"], aliases: ["ai", "ml", "gpt", "llm", "chatgpt", "openai", "claude", "prompt", "prompts"] },
  { name: "Dev", emoji: "🛠", domains: ["github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com", "stackexchange.com", "npmjs.com", "pypi.org", "developer.mozilla.org", "devdocs.io", "codepen.io", "codesandbox.io", "vercel.com", "netlify.com", "readthedocs.io"], keywords: ["sdk"], aliases: ["dev", "developer", "coding", "code", "programming", "github", "git", "frontend", "backend", "javascript", "python", "react"] },
  { name: "Video", emoji: "🎬", domains: ["youtube.com", "youtu.be", "vimeo.com", "netflix.com", "twitch.tv", "hulu.com", "disneyplus.com", "primevideo.com"], aliases: ["video", "videos", "youtube", "movies", "movie", "film", "films", "streaming", "netflix"] },
  { name: "Music", emoji: "🎵", domains: ["spotify.com", "soundcloud.com", "music.apple.com", "music.youtube.com", "bandcamp.com", "tidal.com"], keywords: ["playlist"], aliases: ["music", "spotify", "songs", "playlist", "audio", "podcast", "podcasts"] },
  { name: "Social", emoji: "💬", domains: ["twitter.com", "x.com", "facebook.com", "instagram.com", "reddit.com", "linkedin.com", "tiktok.com", "threads.net", "bsky.app", "discord.com", "mastodon.social"], aliases: ["social", "twitter", "facebook", "instagram", "reddit", "linkedin", "tiktok", "discord"] },
  { name: "News", emoji: "📰", domains: ["nytimes.com", "bbc.com", "bbc.co.uk", "cnn.com", "theguardian.com", "reuters.com", "bloomberg.com", "theverge.com", "techcrunch.com", "arstechnica.com", "wired.com", "news.ycombinator.com"], aliases: ["news", "articles", "blog", "blogs", "media"] },
  { name: "Shopping", emoji: "🛒", domains: ["etsy.com", "aliexpress.com", "walmart.com", "target.com", "bestbuy.com"], brands: ["amazon", "ebay"], aliases: ["shopping", "shop", "store", "stores", "amazon", "ebay", "walmart", "bestbuy", "etsy", "deals", "buy"] },
  { name: "Work & Docs", emoji: "📄", domains: ["docs.google.com", "sheets.google.com", "drive.google.com", "notion.so", "slack.com", "trello.com", "asana.com", "atlassian.net", "dropbox.com", "onedrive.live.com", "airtable.com"], aliases: ["work", "docs", "documents", "notion", "drive", "sheets", "slack", "office", "productivity"] },
  { name: "Email", emoji: "📧", domains: ["mail.google.com", "outlook.com", "outlook.office.com", "proton.me", "protonmail.com"], aliases: ["email", "mail", "gmail", "inbox", "outlook"] },
  { name: "Learning", emoji: "🎓", domains: ["coursera.org", "udemy.com", "edx.org", "khanacademy.org", "brilliant.org", "duolingo.com", "freecodecamp.org", "w3schools.com", "geeksforgeeks.org"], keywords: ["tutorial", "course"], aliases: ["learning", "learn", "courses", "course", "education", "tutorial", "tutorials", "study", "udemy", "coursera", "school"] },
  { name: "Design", emoji: "🎨", domains: ["figma.com", "dribbble.com", "behance.net", "canva.com", "unsplash.com", "pexels.com", "fonts.google.com", "coolors.co"], aliases: ["design", "designs", "ui", "ux", "figma", "fonts", "icons", "graphics", "inspiration", "wallpaper", "wallpapers"] },
  { name: "Finance", emoji: "💰", domains: ["paypal.com", "stripe.com", "wise.com", "coinbase.com", "binance.com", "robinhood.com"], aliases: ["finance", "money", "banking", "bank", "investing", "invest", "crypto", "stocks", "budget", "paypal"] },
  { name: "Gaming", emoji: "🎮", domains: ["steampowered.com", "epicgames.com", "roblox.com", "ign.com", "itch.io"], aliases: ["gaming", "games", "game", "steam", "xbox", "playstation", "nintendo"] },
  { name: "Travel", emoji: "✈️", domains: ["booking.com", "airbnb.com", "expedia.com", "tripadvisor.com", "maps.google.com", "uber.com"], aliases: ["travel", "trips", "flights", "hotels", "hotel", "vacation", "booking", "airbnb"] },
  { name: "Food", emoji: "🍳", domains: ["yelp.com", "doordash.com", "ubereats.com", "allrecipes.com"], keywords: ["recipe"], aliases: ["food", "recipes", "recipe", "cooking", "restaurants", "restaurant", "meals"] },
];

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const matchesDomain = (host: string, domain: string) =>
  host === domain || host.endsWith("." + domain);
const matchesBrand = (host: string, brand: string) =>
  host.split(".").includes(brand);

/** The category a single bookmark belongs to (by domain → brand → keyword). */
export function categoryFor(bookmark: Bookmark): Category | null {
  const host = hostnameOf(bookmark.url);
  if (host) {
    for (const cat of CATEGORIES) {
      if (cat.domains.some((d) => matchesDomain(host, d))) return cat;
      if (cat.brands?.some((b) => matchesBrand(host, b))) return cat;
    }
  }
  const text = `${bookmark.title} ${bookmark.url}`.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords?.some((k) => k && text.includes(k))) return cat;
  }
  return null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The category a folder belongs to, inferred from its NAME (whole-word alias). */
export function categoryForFolderName(name: string): Category | null {
  const lc = name.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.aliases?.some((a) => new RegExp(`\\b${escapeRe(a)}\\b`).test(lc)))
      return cat;
  }
  return null;
}

/** The dominant category among a folder's own bookmarks (≥2 and ≥50% share). */
export function dominantCategory(folderBookmarks: Bookmark[]): Category | null {
  if (folderBookmarks.length === 0) return null;
  const counts = new Map<string, { cat: Category; n: number }>();
  let categorized = 0;
  for (const b of folderBookmarks) {
    const c = categoryFor(b);
    if (!c) continue;
    categorized += 1;
    const cur = counts.get(c.name) ?? { cat: c, n: 0 };
    cur.n += 1;
    counts.set(c.name, cur);
  }
  if (categorized === 0) return null;
  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return top.n >= 2 && top.n / categorized >= 0.5 ? top.cat : null;
}

/**
 * A friendly icon + clean label for a folder row: its leading badge emoji if it
 * has one, else the emoji of the category its name implies, else a plain folder.
 */
export function folderIconFor(name: string): { icon: string; label: string } {
  const stripped = name.replace(/^[^\p{L}\p{N}]+\s*/u, "");
  if (stripped && stripped.length < name.length) {
    const prefix = name.slice(0, name.length - stripped.length).trim();
    if (prefix) return { icon: prefix, label: stripped };
  }
  return { icon: categoryForFolderName(name)?.emoji ?? "📁", label: name };
}

/** Strip a leading emoji/badge + lowercase, so "🛠 Dev" and "dev" compare equal. */
export function baseKey(name: string): string {
  return name
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim()
    .toLowerCase();
}

export type OrganizeCategory = {
  key: string; // "cat:Shopping"
  name: string;
  emoji: string;
  parentName: string; // "🛒 Shopping"
  parentFolderId?: string; // existing top-level folder reused as the parent
  parentIsNew: boolean;
  parentRename?: { from: string; to: string };
  folders: { id: string; name: string }[]; // top-level folders to nest under it
  bookmarks: { id: string; title: string }[]; // loose bookmarks to refile into it
};

export type OrganizePlan = {
  merges: { sourceId: string; targetId: string; sourceName: string; targetName: string; count: number }[];
  categories: OrganizeCategory[];
  looseUncategorized: number; // unfiled bookmarks with no category (left as-is)
  unmatchedFolders: number; // top-level folders with no category (left as-is)
  totalFolders: number;
  totalBookmarks: number;
};

export type OrganizeOptions = { refileLoose?: boolean };

export function buildOrganizePlan(
  bookmarks: Bookmark[],
  folders: Folder[],
  options: OrganizeOptions = {}
): OrganizePlan {
  const refileLoose = options.refileLoose !== false;

  const countByFolder = new Map<string, number>();
  const bmByFolder = new Map<string, Bookmark[]>();
  bookmarks.forEach((b) => {
    if (!b.folderId) return;
    countByFolder.set(b.folderId, (countByFolder.get(b.folderId) ?? 0) + 1);
    const list = bmByFolder.get(b.folderId);
    if (list) list.push(b);
    else bmByFolder.set(b.folderId, [b]);
  });

  // 1) Merge exact-duplicate folders into the fullest childless survivor.
  const hasChildren = new Set(
    folders.filter((f) => f.parentId).map((f) => f.parentId as string)
  );
  const byName = new Map<string, Folder[]>();
  folders.forEach((f) => {
    const k = baseKey(f.name);
    const g = byName.get(k);
    if (g) g.push(f);
    else byName.set(k, [f]);
  });
  const merges: OrganizePlan["merges"] = [];
  const mergedAway = new Set<string>();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const survivor = [...group].sort(
      (a, b) => (countByFolder.get(b.id) ?? 0) - (countByFolder.get(a.id) ?? 0)
    )[0];
    for (const f of group) {
      if (f.id === survivor.id || hasChildren.has(f.id)) continue;
      mergedAway.add(f.id);
      merges.push({
        sourceId: f.id,
        targetId: survivor.id,
        sourceName: f.name,
        targetName: survivor.name,
        count: countByFolder.get(f.id) ?? 0,
      });
    }
  }

  // Existing top-level folders that ARE a category parent (reuse + badge them).
  const catByBase = new Map(CATEGORIES.map((c) => [baseKey(c.name), c] as const));
  const existingParent = new Map<string, Folder>();
  folders.forEach((f) => {
    if (f.parentId || mergedAway.has(f.id)) return;
    const c = catByBase.get(baseKey(f.name));
    if (c && !existingParent.has(c.name)) existingParent.set(c.name, f);
  });

  const acc = new Map<string, OrganizeCategory["folders"] & { bms: OrganizeCategory["bookmarks"] }>();
  const bucket = (name: string) => {
    let b = acc.get(name);
    if (!b) {
      b = Object.assign([] as OrganizeCategory["folders"], {
        bms: [] as OrganizeCategory["bookmarks"],
      });
      acc.set(name, b);
    }
    return b;
  };

  // 2) Nest matching top-level folders under their category.
  let unmatchedFolders = 0;
  folders.forEach((f) => {
    if (f.parentId || mergedAway.has(f.id)) return;
    if (catByBase.has(baseKey(f.name))) return; // it's a category parent itself
    const cat =
      categoryForFolderName(f.name) ?? dominantCategory(bmByFolder.get(f.id) ?? []);
    if (!cat) {
      unmatchedFolders += 1;
      return;
    }
    bucket(cat.name).push({ id: f.id, name: f.name });
  });

  // 3) Refile loose (unfiled) bookmarks into their category.
  let looseUncategorized = 0;
  if (refileLoose) {
    bookmarks.forEach((b) => {
      if (b.folderId) return;
      const c = categoryFor(b);
      if (c) bucket(c.name).bms.push({ id: b.id, title: b.title });
      else looseUncategorized += 1;
    });
  }

  // 4) Assemble categories that actually receive something.
  const categories: OrganizeCategory[] = [];
  for (const cat of CATEGORIES) {
    const b = acc.get(cat.name);
    if (!b || (b.length === 0 && b.bms.length === 0)) continue;
    const existing = existingParent.get(cat.name);
    const parentName = `${cat.emoji} ${cat.name}`;
    categories.push({
      key: `cat:${cat.name}`,
      name: cat.name,
      emoji: cat.emoji,
      parentName,
      parentFolderId: existing?.id,
      parentIsNew: !existing,
      parentRename:
        existing && existing.name !== parentName
          ? { from: existing.name, to: parentName }
          : undefined,
      folders: [...b],
      bookmarks: b.bms,
    });
  }

  return {
    merges,
    categories,
    looseUncategorized,
    unmatchedFolders,
    totalFolders: folders.length,
    totalBookmarks: bookmarks.length,
  };
}

export const categoryCount = (c: OrganizeCategory) =>
  c.folders.length + c.bookmarks.length;

export function planHasChanges(plan: OrganizePlan): boolean {
  return plan.merges.length > 0 || plan.categories.length > 0;
}
