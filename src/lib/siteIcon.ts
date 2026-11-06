// Server only: a site's icon, fetched by us, so the browser no longer asks Google's
// icon service — which saw the domain of every bookmark — nor the site itself.
//
// Raster only. An SVG can carry script, and this route answers from our own origin:
// opened directly, a hostile site's SVG would run as us. So the bytes are sniffed and
// anything but PNG, JPEG, GIF, WebP or ICO is refused, whatever the server called it.

import { fetchHtml, fetchImage } from "@/lib/fetchPage";

export type IconType = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/x-icon";

const MAX_ICON_BYTES = 100 * 1024;
const BUDGET_MS = 9_000; // the whole search, homepage included
const MAX_TRIES = 4;

/** A bare public hostname we will look up: letters, digits and hyphens, dotted, no IP literal. */
export function iconHost(raw: string | null | undefined): string | null {
  const host = (raw ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (host.length === 0 || host.length > 253) return null;
  if (/^[\d.]+$/.test(host) || host.includes(":")) return null;
  const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const parts = host.split(".");
  return parts.length >= 2 && parts.every((p) => label.test(p)) ? host : null;
}

/** What the bytes are, from their first bytes — never from a header. */
export function sniffIcon(b: Uint8Array): IconType | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (b.length < 12) return null;
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(0, 0x00, 0x00, 0x01, 0x00)) return "image/x-icon";
  return null;
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
};

/**
 * The icons a page's <head> declares, best first: the large touch icon, then sized
 * icons largest first, then the rest. SVG is skipped (see above). Relative links are
 * resolved against the page; only http(s) survives.
 */
export function iconLinks(html: string, base: string): string[] {
  const found: { url: string; rank: number }[] = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    if (!/\bicon\b/.test(rel)) continue;
    const href = attr(tag, "href");
    if (!href) continue;
    if ((attr(tag, "type") ?? "").toLowerCase().includes("svg") || /\.svgz?(?:[?#]|$)/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    const size = Number(/(\d+)x\d+/.exec(attr(tag, "sizes") ?? "")?.[1] ?? 0);
    const rank = rel.includes("apple-touch-icon") ? 10_000 : size || 1;
    found.push({ url: url.href, rank });
  }
  return [...new Map(found.sort((a, b) => b.rank - a.rank).map((f) => [f.url, f])).keys()];
}

export type IconDeps = {
  html: typeof fetchHtml;
  image: typeof fetchImage;
  now: () => number;
};

const realDeps: IconDeps = { html: fetchHtml, image: fetchImage, now: () => Date.now() };

/**
 * The best raster icon `host` offers — the ones its homepage declares, then
 * /favicon.ico — or null. Never throws; every fetch goes through the same fence
 * as link titles (public addresses only, every redirect re-checked).
 */
export async function fetchSiteIcon(
  host: string,
  deps: IconDeps = realDeps
): Promise<{ bytes: Buffer; type: IconType } | null> {
  const deadline = deps.now() + BUDGET_MS;
  const left = () => Math.max(0, deadline - deps.now());
  const home = `https://${host}/`;
  const page = await deps.html(home, { stopAtHead: true, maxBytes: 128 * 1024, timeoutMs: Math.min(4_000, left()) });
  // The declared icons first, and /favicon.ico always last — however many a page declares.
  const declared = page ? iconLinks(page.html, home).slice(0, MAX_TRIES - 1) : [];
  const candidates = [...new Set([...declared, `https://${host}/favicon.ico`])];
  for (const url of candidates) {
    if (left() < 500) break;
    const bytes = await deps.image(url, { maxBytes: MAX_ICON_BYTES, timeoutMs: Math.min(4_000, left()) });
    const type = bytes ? sniffIcon(bytes) : null;
    if (bytes && type) return { bytes, type };
  }
  return null;
}
