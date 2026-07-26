import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { createCheckoutUrl, checkoutConfigured } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";

// Start a premium checkout. Session-gated; returns a Lemon Squeezy hosted
// checkout URL tagged with the user's email so the webhook can grant access.
export async function POST(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const email = jwt?.email;
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!checkoutConfigured()) {
    return NextResponse.json({ error: "billing_unconfigured" }, { status: 503 });
  }
  const url = await createCheckoutUrl(String(email));
  if (!url) {
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
  return NextResponse.json({ url });
}
