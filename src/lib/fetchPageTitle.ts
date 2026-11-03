// Server only: fetch a user-typed page and read its title, without letting the
// fetch reach anything but the public internet. See pageTitle.ts for the parsing
// and the address rules; fetchPageTitle.test.ts runs it against a local server.

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";

import { extractTitle, isPublicAddress } from "@/lib/pageTitle";

const MAX_BYTES = 256 * 1024; // a <title> lives in the head; never read a whole page
const TIMEOUT_MS = 5_000; // for the whole chain, redirects included
const MAX_REDIRECTS = 3;
const USER_AGENT = "Mozilla/5.0 (compatible; BookmarkDeck/1.0; +link title)";

export type FetchTitleOptions = {
  /** Test seam: which resolved addresses may be connected to. */
  allowAddress?: (ip: string) => boolean;
  /** Test seam: a local test server listens on a random port. */
  anyPort?: boolean;
};

class Refused extends Error {}

/**
 * Validates the addresses at CONNECT time, not before the request: a check of a
 * separate DNS answer would pass a host that resolves somewhere public for the
 * check and somewhere private for the connection (DNS rebinding).
 */
function guardedLookup(allow: (ip: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = addresses as LookupAddress[];
      if (list.length === 0 || !list.every((a) => allow(a.address))) {
        return callback(new Refused(`refused address for ${hostname}`), "", 0);
      }
      if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

function bareHost(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/** A URL this fetcher will ask for at all: http(s), default ports, no credentials. */
function fetchable(url: URL, allow: (ip: string) => boolean, anyPort: boolean): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (!anyPort && url.port && url.port !== "80" && url.port !== "443") return false;
  if (url.username || url.password) return false;
  // An IP literal never goes through `lookup`, so it is judged here.
  const host = bareHost(url.hostname);
  if (/^[\d.]+$/.test(host) || host.includes(":")) return allow(host);
  return true;
}

function decoder(encoding: string | undefined) {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}

type Hop = { status: number; location?: string; html?: string };

function request(url: URL, allow: (ip: string) => boolean, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: guardedLookup(allow),
        signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "en",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location });
        }
        const type = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status !== 200 || !(type.includes("text/html") || type.includes("application/xhtml"))) {
          res.resume();
          return resolve({ status });
        }
        const unzip = decoder(res.headers["content-encoding"] as string | undefined);
        const body = unzip ? res.pipe(unzip) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          res.destroy();
          resolve({ status, html: Buffer.concat(chunks).toString("utf8") });
        };
        body.on("data", (chunk: Buffer) => {
          if (done) return;
          chunks.push(chunk);
          size += chunk.length;
          // Enough to hold the head; stop as soon as it's been read past.
          if (size >= MAX_BYTES || /<\/head\s*>/i.test(chunk.toString("utf8"))) finish();
        });
        body.on("end", finish);
        body.on("error", (e) => (done ? undefined : reject(e)));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * The title of the page at `raw`, or null for anything else: a page with no
 * title, not HTML, an error, a timeout, more than three redirects, or any hop
 * that would leave the public internet. Never throws.
 */
export async function fetchPageTitle(raw: string, opts: FetchTitleOptions = {}): Promise<string | null> {
  const allow = opts.allowAddress ?? isPublicAddress;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!fetchable(url, allow, opts.anyPort === true)) return null;
      const res = await request(url, allow, signal);
      if (res.location !== undefined) {
        url = new URL(res.location, url); // re-checked at the top of the loop
        continue;
      }
      return res.html ? extractTitle(res.html) : null;
    }
    return null;
  } catch {
    return null;
  }
}
