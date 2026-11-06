// Server only: fetch a page a user typed — for its title, or to read it — without
// letting the fetch reach anything but the public internet. The address rules are
// in pageTitle.ts; fetchPageTitle.test.ts runs this against a local server.

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";

import { isPublicAddress } from "@/lib/pageTitle";

const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000; // for the whole chain, redirects included
const MAX_REDIRECTS = 3;
const USER_AGENT = "Mozilla/5.0 (compatible; BookmarkDeck/1.0; +link title)";

export type FetchHtmlOptions = {
  /** Stop reading after this many bytes (the page is cut there, not refused). */
  maxBytes?: number;
  /** Time allowed for the whole chain, redirects included. */
  timeoutMs?: number;
  /** Stop as soon as the head has been read — all a title needs. */
  stopAtHead?: boolean;
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

type Hop = { status: number; location?: string; body?: Buffer; type?: string; truncated?: boolean };

/** What a request will read: a page, or an image. Anything else is answered with its status only. */
type Want = {
  accept: string;
  takes: (contentType: string) => boolean;
};

const HTML: Want = {
  accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
  takes: (type) => type.includes("text/html") || type.includes("application/xhtml"),
};

const IMAGE: Want = {
  accept: "image/png,image/x-icon,image/vnd.microsoft.icon,image/*;q=0.8",
  // The bytes are sniffed afterwards; this only stops a page being read as an image.
  takes: (type) => type.startsWith("image/") || type === "application/octet-stream" || type === "",
};

function request(
  url: URL,
  allow: (ip: string) => boolean,
  signal: AbortSignal,
  maxBytes: number,
  stopAtHead: boolean,
  want: Want
): Promise<Hop> {
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
          accept: want.accept,
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
        if (status !== 200 || !want.takes(type)) {
          res.resume();
          return resolve({ status });
        }
        const unzip = decoder(res.headers["content-encoding"] as string | undefined);
        const body = unzip ? res.pipe(unzip) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const finish = (truncated: boolean) => {
          if (done) return;
          done = true;
          res.destroy();
          resolve({ status, body: Buffer.concat(chunks), type, truncated });
        };
        body.on("data", (chunk: Buffer) => {
          if (done) return;
          chunks.push(chunk);
          size += chunk.length;
          if (size >= maxBytes) return finish(true);
          // A title needs only the head: stop as soon as it's been read past.
          if (stopAtHead && /<\/head\s*>/i.test(chunk.toString("utf8"))) finish(false);
        });
        body.on("end", () => finish(false));
        body.on("error", (e) => (done ? undefined : reject(e)));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * The HTML of the public page at `raw` — cut at `maxBytes`, flagged `truncated` —
 * or null for anything else: not HTML, an error status, a timeout, more than three
 * redirects, or any hop that would leave the public internet. Never throws.
 */
export async function fetchHtml(
  raw: string,
  opts: FetchHtmlOptions = {}
): Promise<{ html: string; truncated: boolean } | null> {
  const got = await fetchFenced(raw, opts, HTML);
  return got ? { html: got.body.toString("utf8"), truncated: got.truncated } : null;
}

/**
 * The bytes of the image at `raw`, or null — on the same terms as `fetchHtml`
 * (public addresses only, every redirect re-checked). An image longer than
 * `maxBytes` is refused, not cut: half an image is no use. The caller sniffs the
 * bytes; the server's content type is only a first filter.
 */
export async function fetchImage(
  raw: string,
  opts: Omit<FetchHtmlOptions, "stopAtHead"> = {}
): Promise<Buffer | null> {
  const got = await fetchFenced(raw, opts, IMAGE);
  return got && !got.truncated ? got.body : null;
}

async function fetchFenced(
  raw: string,
  opts: FetchHtmlOptions,
  want: Want
): Promise<{ body: Buffer; truncated: boolean } | null> {
  const allow = opts.allowAddress ?? isPublicAddress;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!fetchable(url, allow, opts.anyPort === true)) return null;
      const res = await request(
        url,
        allow,
        signal,
        opts.maxBytes ?? DEFAULT_MAX_BYTES,
        opts.stopAtHead === true,
        want
      );
      if (res.location !== undefined) {
        url = new URL(res.location, url); // re-checked at the top of the loop
        continue;
      }
      return res.body === undefined ? null : { body: res.body, truncated: res.truncated === true };
    }
    return null;
  } catch {
    return null;
  }
}
