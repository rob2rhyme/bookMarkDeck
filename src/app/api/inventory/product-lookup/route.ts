import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  looksScannable,
  normalizeBarcode,
  parseUpcItemDb,
  shortCategory,
  type ProductInfo,
} from "@/features/inventory/lib/productLookup";

export const runtime = "nodejs";

// Barcode → product lookup. Defaults to the UPCitemdb *trial* endpoint (no key,
// rate-limited); point UPC_LOOKUP_URL at a paid endpoint and set UPC_LOOKUP_KEY
// to upgrade without code changes. Session-gated so it isn't an open proxy.
const LOOKUP_BASE =
  process.env.UPC_LOOKUP_URL ?? "https://api.upcitemdb.com/prod/trial/lookup";
const LOOKUP_KEY = process.env.UPC_LOOKUP_KEY;

export async function GET(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!jwt) {
    return NextResponse.json({ found: false, error: "unauthorized" }, { status: 401 });
  }

  const code = normalizeBarcode(req.nextUrl.searchParams.get("code") ?? "");
  if (!looksScannable(code)) {
    return NextResponse.json({ found: false, error: "bad_code" }, { status: 400 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${LOOKUP_BASE}?upc=${encodeURIComponent(code)}`, {
      headers: LOOKUP_KEY ? { user_key: LOOKUP_KEY, key_type: "3scale" } : {},
      signal: ctrl.signal,
      cache: "no-store",
    });
    // Rate-limited / provider hiccup → a soft miss, so the client just lets the
    // user type the details in. Only auth/validation are hard errors.
    if (!res.ok) {
      return NextResponse.json({ found: false, error: `provider_${res.status}` });
    }
    const parsed = parseUpcItemDb(await res.json());
    if (!parsed) return NextResponse.json({ found: false });
    const product: ProductInfo = {
      ...parsed,
      category: shortCategory(parsed.category),
    };
    return NextResponse.json({ found: true, product });
  } catch {
    return NextResponse.json({ found: false, error: "lookup_failed" });
  } finally {
    clearTimeout(timer);
  }
}
