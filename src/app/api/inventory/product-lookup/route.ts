import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  looksScannable,
  normalizeBarcode,
  parseOpenFacts,
  parseUpcItemDb,
  resolveUpcEndpoint,
  shortCategory,
  type ProductInfo,
} from "@/features/inventory/lib/productLookup";

export const runtime = "nodejs";

// Barcode → product lookup. Defaults to the UPCitemdb *trial* endpoint (no key,
// rate-limited); point UPC_LOOKUP_URL at a paid endpoint and set UPC_LOOKUP_KEY
// to upgrade without code changes. resolveUpcEndpoint also *recovers* from the
// common misconfig — paid URL set but the key blank/placeholder — by using the
// free trial instead of 401-ing every scan. Session-gated (not an open proxy).
const { url: LOOKUP_BASE, key: LOOKUP_KEY } = resolveUpcEndpoint(
  process.env.UPC_LOOKUP_URL,
  process.env.UPC_LOOKUP_KEY
);

// Free, keyless, global fallbacks (great for EAN/JAN — where the US-centric,
// rate-limited UPCitemdb trial misses most). Same API shape across all three.
const OPEN_FACTS_HOSTS = [
  "https://world.openfoodfacts.org",
  "https://world.openproductsfacts.org",
  "https://world.openbeautyfacts.org",
];
const OPEN_FACTS_FIELDS =
  "product_name,product_name_en,generic_name,brands,categories,image_url,image_front_url";

async function lookupOpenFacts(code: string): Promise<ProductInfo | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const results = await Promise.allSettled(
      OPEN_FACTS_HOSTS.map(async (host) => {
        const res = await fetch(
          `${host}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OPEN_FACTS_FIELDS}`,
          {
            headers: { "User-Agent": "BookmarkDeck/1.0 (inventory product lookup)" },
            signal: ctrl.signal,
            cache: "no-store",
          }
        );
        return res.ok ? parseOpenFacts(await res.json()) : null;
      })
    );
    for (const r of results) if (r.status === "fulfilled" && r.value) return r.value;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!jwt) {
    return NextResponse.json({ found: false, error: "unauthorized" }, { status: 401 });
  }

  const code = normalizeBarcode(req.nextUrl.searchParams.get("code") ?? "");
  if (!looksScannable(code)) {
    return NextResponse.json({ found: false, error: "bad_code" }, { status: 400 });
  }

  // 1) UPCitemdb (richest — has price/model). Its trial is rate-limited and
  //    US-centric, so a non-200 or empty result is a soft miss we fall through.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${LOOKUP_BASE}?upc=${encodeURIComponent(code)}`, {
      headers: LOOKUP_KEY ? { user_key: LOOKUP_KEY, key_type: "3scale" } : {},
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.ok) {
      const parsed = parseUpcItemDb(await res.json());
      if (parsed) {
        return NextResponse.json({
          found: true,
          product: { ...parsed, category: shortCategory(parsed.category) },
        });
      }
    }
  } catch {
    /* fall through to the free fallbacks below */
  } finally {
    clearTimeout(timer);
  }

  // 2) Open Facts (free, keyless, global) — the reason most EAN/JAN scans now
  //    resolve where the trial couldn't.
  try {
    const off = await lookupOpenFacts(code);
    if (off) return NextResponse.json({ found: true, product: off });
  } catch {
    /* soft miss */
  }

  return NextResponse.json({ found: false });
}
