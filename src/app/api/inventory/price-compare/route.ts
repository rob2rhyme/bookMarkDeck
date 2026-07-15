import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  looksScannable,
  normalizeBarcode,
  parseUpcItemDbOffers,
  resolveUpcEndpoint,
} from "@/features/inventory/lib/productLookup";

export const runtime = "nodejs";

// Live competitor prices for the price-comparison panel. Reuses the barcode
// lookup provider (UPCitemdb) — its responses carry merchant `offers`. Defaults
// to the keyless trial (rate-limited, thin offers); set UPC_LOOKUP_URL/KEY to
// the paid tier for richer, real-time offers. Session-gated (not an open proxy).
const { url: LOOKUP_BASE, key: LOOKUP_KEY } = resolveUpcEndpoint(
  process.env.UPC_LOOKUP_URL,
  process.env.UPC_LOOKUP_KEY
);

// A real paid key is set → live prices are "configured". The keyless trial can
// still return offers, but the client uses this to label the source honestly.
const CONFIGURED = Boolean(LOOKUP_KEY);

export async function GET(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!jwt) {
    return NextResponse.json(
      { offers: [], configured: false },
      { status: 401 }
    );
  }

  const code = normalizeBarcode(req.nextUrl.searchParams.get("code") ?? "");
  if (!looksScannable(code)) {
    return NextResponse.json({ offers: [], configured: CONFIGURED });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${LOOKUP_BASE}?upc=${encodeURIComponent(code)}`, {
      headers: LOOKUP_KEY ? { user_key: LOOKUP_KEY, key_type: "3scale" } : {},
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.ok) {
      const offers = parseUpcItemDbOffers(await res.json());
      return NextResponse.json({ offers, configured: CONFIGURED });
    }
  } catch {
    // Rate-limited / offline — a soft miss falls through to no live offers.
  } finally {
    clearTimeout(timer);
  }
  return NextResponse.json({ offers: [], configured: CONFIGURED });
}
