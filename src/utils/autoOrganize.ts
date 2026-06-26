// Smart auto-organize for bookmarks + folders. Pure (no React/Firebase) so it's
// easy to test and reason about. Produces a PLAN (merge duplicate folders, badge
// existing category folders, create missing ones, refile bookmarks) that the UI
// previews before applying — nothing here mutates anything.

import type { Bookmark } from "@/types/bookmark";
import type { Folder } from "@/types/folder";

export type Category = {
  name: string;
  emoji: string;
  domains: string[]; // matched as the registrable domain or a subdomain of it
  brands?: string[]; // matched as an exact hostname label (covers multi-TLD brands)
  keywords?: string[]; // matched in the title/url as a fallback
};

// Order matters — the first matching category wins, so put the more specific
// ones (AI before Dev) first.
export const CATEGORIES: readonly Category[] = [
  { name: "AI", emoji: "🤖", domains: ["openai.com", "chatgpt.com", "claude.ai", "anthropic.com", "huggingface.co", "perplexity.ai", "midjourney.com", "gemini.google.com", "replicate.com"], keywords: ["chatgpt", "prompt engineering"] },
  { name: "Dev", emoji: "🛠", domains: ["github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com", "stackexchange.com", "npmjs.com", "pypi.org", "developer.mozilla.org", "devdocs.io", "codepen.io", "codesandbox.io", "vercel.com", "netlify.com", "readthedocs.io"], keywords: ["api docs", "documentation", "sdk"] },
  { name: "Video", emoji: "🎬", domains: ["youtube.com", "youtu.be", "vimeo.com", "netflix.com", "twitch.tv", "hulu.com", "disneyplus.com", "primevideo.com"], keywords: [] },
  { name: "Music", emoji: "🎵", domains: ["spotify.com", "soundcloud.com", "music.apple.com", "music.youtube.com", "bandcamp.com", "tidal.com"], keywords: ["playlist"] },
  { name: "Social", emoji: "💬", domains: ["twitter.com", "x.com", "facebook.com", "instagram.com", "reddit.com", "linkedin.com", "tiktok.com", "threads.net", "bsky.app", "discord.com", "mastodon.social"], keywords: [] },
  { name: "News", emoji: "📰", domains: ["nytimes.com", "bbc.com", "bbc.co.uk", "cnn.com", "theguardian.com", "reuters.com", "bloomberg.com", "theverge.com", "techcrunch.com", "arstechnica.com", "wired.com", "news.ycombinator.com"], keywords: [] },
  { name: "Shopping", emoji: "🛒", domains: ["etsy.com", "aliexpress.com", "walmart.com", "target.com", "bestbuy.com"], brands: ["amazon", "ebay"], keywords: [] },
  { name: "Work & Docs", emoji: "📄", domains: ["docs.google.com", "sheets.google.com", "drive.google.com", "notion.so", "slack.com", "trello.com", "asana.com", "atlassian.net", "dropbox.com", "onedrive.live.com", "airtable.com"], keywords: ["spreadsheet"] },
  { name: "Email", emoji: "📧", domains: ["mail.google.com", "outlook.com", "outlook.office.com", "proton.me", "protonmail.com"], keywords: [] },
  { name: "Learning", emoji: "🎓", domains: ["coursera.org", "udemy.com", "edx.org", "khanacademy.org", "brilliant.org", "duolingo.com", "freecodecamp.org", "w3schools.com", "geeksforgeeks.org"], keywords: ["tutorial", "course"] },
  { name: "Design", emoji: "🎨", domains: ["figma.com", "dribbble.com", "behance.net", "canva.com", "unsplash.com", "pexels.com", "fonts.google.com", "coolors.co"], keywords: ["icons", "wallpaper"] },
  { name: "Finance", emoji: "💰", domains: ["paypal.com", "stripe.com", "wise.com", "coinbase.com", "binance.com", "robinhood.com"], keywords: ["banking", "invoice"] },
  { name: "Gaming", emoji: "🎮", domains: ["steampowered.com", "epicgames.com", "roblox.com", "ign.com", "itch.io"], keywords: [] },
  { name: "Travel", emoji: "✈️", domains: ["booking.com", "airbnb.com", "expedia.com", "tripadvisor.com", "maps.google.com", "uber.com"], keywords: ["flights", "hotel"] },
  { name: "Food", emoji: "🍳", domains: ["yelp.com", "doordash.com", "ubereats.com", "allrecipes.com"], keywords: ["recipe"] },
];

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

function matchesBrand(host: string, brand: string): boolean {
  return host.split(".").includes(brand);
}

/** The category a bookmark belongs to, or null when nothing matches confidently. */
export function categoryFor(bookmark: Bookmark): Category | null {
  const host = hostnameOf(bookmark.url);
  if (!host) return null;
  for (const cat of CATEGORIES) {
    if (cat.domains.some((d) => matchesDomain(host, d))) return cat;
    if (cat.brands?.some((b) => matchesBrand(host, b))) return cat;
  }
  const text = `${bookmark.title} ${bookmark.url}`.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords?.some((k) => k && text.includes(k))) return cat;
  }
  return null;
}

/** Strip a leading emoji/badge + lowercase, so "🛠 Dev" and "dev" compare equal. */
export function baseKey(name: string): string {
  return name
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim()
    .toLowerCase();
}

const badgedName = (cat: Category) => `${cat.emoji} ${cat.name}`;

export type OrganizePlan = {
  merges: { sourceId: string; targetId: string; sourceName: string; targetName: string; count: number }[];
  renames: { folderId: string; from: string; to: string }[];
  creates: { key: string; name: string; count: number }[]; // key = "new:<category>"
  moves: { bookmarkId: string; title: string; targetKey: string; targetName: string }[];
  unmatched: number;
  alreadyFiled: number;
};

/**
 * Build a non-destructive reorganization plan: merge exact-duplicate folders,
 * route each bookmark to a badged top-level category folder (reusing an existing
 * one or creating it), and badge any matched existing folder. Top-level only —
 * the user's own nested folders are never deleted.
 */
export function buildOrganizePlan(
  bookmarks: Bookmark[],
  folders: Folder[]
): OrganizePlan {
  const countByFolder = new Map<string, number>();
  bookmarks.forEach((b) => {
    if (b.folderId)
      countByFolder.set(b.folderId, (countByFolder.get(b.folderId) ?? 0) + 1);
  });

  // 1) Duplicate folders (same normalized name) → merge childless ones into the
  //    fullest survivor. survivorOf maps any merged folder id to its survivor.
  const hasChildren = new Set(
    folders.filter((f) => f.parentId).map((f) => f.parentId as string)
  );
  const byName = new Map<string, Folder[]>();
  folders.forEach((f) => {
    const k = baseKey(f.name);
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(f);
  });

  const merges: OrganizePlan["merges"] = [];
  const survivorOf = new Map<string, string>();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const survivor = [...group].sort(
      (a, b) => (countByFolder.get(b.id) ?? 0) - (countByFolder.get(a.id) ?? 0)
    )[0];
    for (const f of group) {
      if (f.id === survivor.id) continue;
      if (hasChildren.has(f.id)) continue; // can't merge a folder with subfolders
      survivorOf.set(f.id, survivor.id);
      merges.push({
        sourceId: f.id,
        targetId: survivor.id,
        sourceName: f.name,
        targetName: survivor.name,
        count: countByFolder.get(f.id) ?? 0,
      });
    }
  }
  const survivor = (id: string | null | undefined) =>
    (id && survivorOf.get(id)) || id || null;

  // 2) Resolve a target folder per category (existing badged/un-badged top-level
  //    folder, or a new one). Only categories that actually receive a bookmark.
  const topLevelByBase = new Map<string, Folder>();
  folders.forEach((f) => {
    if (f.parentId) return;
    if (survivorOf.has(f.id)) return; // skip folders being merged away
    if (!topLevelByBase.has(baseKey(f.name))) topLevelByBase.set(baseKey(f.name), f);
  });

  const renames: OrganizePlan["renames"] = [];
  const creates = new Map<string, { key: string; name: string; count: number }>();
  const targetKeyForCat = new Map<string, { key: string; name: string }>();

  const resolveTarget = (cat: Category): { key: string; name: string } => {
    const cached = targetKeyForCat.get(cat.name);
    if (cached) return cached;
    const existing = topLevelByBase.get(baseKey(cat.name));
    let resolved: { key: string; name: string };
    if (existing) {
      const wanted = badgedName(cat);
      if (existing.name !== wanted)
        renames.push({ folderId: existing.id, from: existing.name, to: wanted });
      resolved = { key: existing.id, name: wanted };
    } else {
      resolved = { key: `new:${cat.name}`, name: badgedName(cat) };
    }
    targetKeyForCat.set(cat.name, resolved);
    return resolved;
  };

  // 3) Moves.
  const moves: OrganizePlan["moves"] = [];
  let unmatched = 0;
  let alreadyFiled = 0;
  for (const b of bookmarks) {
    const cat = categoryFor(b);
    if (!cat) {
      unmatched += 1;
      continue;
    }
    const target = resolveTarget(cat);
    const currentEffective = survivor(b.folderId ?? null);
    if (!target.key.startsWith("new:") && currentEffective === target.key) {
      alreadyFiled += 1;
      continue;
    }
    if (target.key.startsWith("new:")) {
      const c = creates.get(target.key) ?? { key: target.key, name: target.name, count: 0 };
      c.count += 1;
      creates.set(target.key, c);
    }
    moves.push({
      bookmarkId: b.id,
      title: b.title,
      targetKey: target.key,
      targetName: target.name,
    });
  }

  return {
    merges,
    renames,
    creates: [...creates.values()],
    moves,
    unmatched,
    alreadyFiled,
  };
}

/** True when a plan would actually change something. */
export function planHasChanges(plan: OrganizePlan): boolean {
  return (
    plan.merges.length > 0 ||
    plan.renames.length > 0 ||
    plan.creates.length > 0 ||
    plan.moves.length > 0
  );
}
