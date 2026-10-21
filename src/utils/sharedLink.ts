// What another app hands Bookmark Deck through the system Share sheet
// (manifest `share_target`, GET /share?title=&text=&url=).
//
// Apps fill the three fields inconsistently: Chrome on Android sends the page
// title in `title` and often leaves `url` empty with the link inside `text`;
// some apps send only `text` ("Look at this https://…"). So the link is the
// `url` field if it is a web link, else the first http(s) link in `text`. Only
// http(s) is accepted — a shared `javascript:` link is refused here, as a typed
// one is by normalizeUrl.

import { normalizeUrl } from "@/utils/normalizeUrl";

export type SharedLink = { url: string; title: string };

const LINK_IN_TEXT = /https?:\/\/[^\s<>"']+/i;
// Punctuation that ends a sentence rather than the link ("see https://a.com/x.").
const TRAILING = /[.,;:!?)\]}'"»”’]+$/;

function webLink(raw: string): string {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return "";
  try {
    const parsed = new URL(normalizeUrl(trimmed));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The link and a title from a share, or null when it carries no web link. */
export function parseSharedLink(params: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}): SharedLink | null {
  const text = (params.text ?? "").trim();
  let url = webLink(params.url ?? "");
  let found = "";
  if (!url) {
    const match = LINK_IN_TEXT.exec(text);
    if (match) {
      found = match[0];
      url = webLink(found.replace(TRAILING, ""));
    }
  }
  if (!url) return null;

  const sharedTitle = (params.title ?? "").trim();
  // Text that was only the link (or the link plus a word or two around it)
  // isn't a title; what remains after taking the link out can be.
  const rest = (found ? text.replace(found, " ") : text).replace(/\s+/g, " ").trim();
  const title = (sharedTitle || (rest && !webLink(rest) ? rest : "") || hostOf(url)).slice(0, 200);
  return { url, title };
}

/** Two links that open the same page: case-insensitive host, no trailing slash, no #fragment. */
export function sameLink(a: string, b: string): boolean {
  const key = (u: string) => {
    try {
      const p = new URL(normalizeUrl(u));
      p.hash = "";
      return p.toString().replace(/\/$/, "").toLowerCase();
    } catch {
      return u.trim().toLowerCase();
    }
  };
  return key(a) === key(b);
}
