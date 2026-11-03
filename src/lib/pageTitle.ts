// Pure helpers for naming a bookmark from its page: read the title out of the
// HTML, and decide whether an address is one the server may fetch at all. No
// network here — see `@/lib/fetchPageTitle` (server) and pageTitle.test.ts.

import { isIP } from "node:net";

export const TITLE_MAX_CHARS = 200;

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

function clean(raw: string | undefined): string | null {
  if (!raw) return null;
  const text = decodeEntities(raw)
    // Control characters would read as nothing, or as garbage, in a title.
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > TITLE_MAX_CHARS ? `${text.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…` : text;
}

/** The content of a `<meta>` whose property/name is `key`, in either attribute order. */
function metaContent(html: string, key: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (name?.toLowerCase() !== key) continue;
    const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? /\bcontent\s*=\s*'([^']*)'/i.exec(tag)?.[1];
    if (content !== undefined) return content;
  }
  return undefined;
}

/**
 * The page's own name for itself: `og:title`, then `twitter:title`, then
 * `<title>` — the social titles first because sites write them for exactly this
 * (a link card) and leave the `<title>` stuffed with " | Site — tagline". Decoded,
 * whitespace collapsed, capped. Null when the page names nothing.
 */
export function extractTitle(html: string): string | null {
  return (
    clean(metaContent(html, "og:title")) ??
    clean(metaContent(html, "twitter:title")) ??
    clean(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1])
  );
}

function v4Parts(ip: string): number[] | null {
  const parts = ip.split(".").map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? parts : null;
}

function publicV4(ip: string): boolean {
  const p = v4Parts(ip);
  if (!p) return false;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return false; // this-network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local — includes cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** Expand an IPv6 address to its eight 16-bit groups, or null. */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  // A trailing dotted quad (::ffff:1.2.3.4) is the last two groups.
  const quad = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (quad) {
    const p = v4Parts(quad[1]);
    if (!p) return null;
    s = `${s.slice(0, -quad[1].length)}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function publicV6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return false;
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  const embeddedV4 = `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) reach an IPv4 host:
  // judge that host.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return publicV4(embeddedV4);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return publicV4(embeddedV4);
  if (g.slice(0, 6).every((x) => x === 0)) return false; // deprecated IPv4-compatible
  if ((g[0] & 0xfe00) === 0xfc00) return false; // unique local
  if ((g[0] & 0xffc0) === 0xfe80) return false; // link-local
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  return true;
}

/**
 * May the server connect here? Only a public unicast address: never loopback,
 * a private or link-local range (169.254.169.254 is the cloud metadata service),
 * or one of those reached through an IPv4-mapped or NAT64 IPv6 form. Anything
 * that doesn't parse as an address is refused.
 */
export function isPublicAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return publicV4(ip);
  if (v === 6) return publicV6(ip);
  return false;
}
