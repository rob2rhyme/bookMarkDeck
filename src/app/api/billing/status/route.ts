import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { billingConfigured, getEntitlement } from "@/lib/entitlement";

export const runtime = "nodejs";

// Client-facing entitlement check for UI gating. Returns whether billing is
// configured at all and whether this user is pro. Reads happen only here and on
// actual metered calls (both infrequent).
export async function GET(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const email = jwt?.email;
  if (!email) {
    return NextResponse.json({ configured: false, pro: false }, { status: 401 });
  }
  const configured = billingConfigured();
  const ent = configured ? await getEntitlement(String(email)) : null;
  return NextResponse.json({ configured, pro: Boolean(ent?.pro) });
}
