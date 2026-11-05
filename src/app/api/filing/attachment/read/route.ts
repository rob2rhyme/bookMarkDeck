import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { createHash } from "node:crypto";

import { filingStorage, presignFilingGet } from "@/features/filing/lib/filingStorage";
import { isOwnedFilingPath } from "@/features/filing/lib/r2";
import { createRateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

// A short-lived signed READ URL for one scan. This is what lets the bucket be private:
// nothing is served from a public address, so a scan's URL can't leak through history,
// a referrer, a screenshot or a support thread and keep working — it expires in two
// minutes and is only ever issued to the signed-in owner of that exact object.
//
// Session-gated, and the key must sit inside the caller's own `filing/{userSeg}/` prefix
// (the server-derived segment the presign route writes under), so one user cannot ask
// for another's object, nor — the predicate being scoped to `filing/` — for anything
// another pillar stored. A path that is not theirs is answered exactly like one that
// does not exist.
//
// Inert (enabled:false) until R2 is configured, like the other filing routes.
const limited = createRateLimiter(60_000, 120);

export async function POST(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!jwt?.sub) {
    return NextResponse.json({ enabled: false, error: "unauthorized" }, { status: 401 });
  }

  const storage = filingStorage();
  if (!storage) return NextResponse.json({ enabled: false });

  let path = "";
  try {
    const body = (await req.json()) as { path?: unknown };
    path = typeof body.path === "string" ? body.path : "";
  } catch {
    /* falls through to bad_path */
  }

  const userSeg = createHash("sha256").update(String(jwt.sub)).digest("hex").slice(0, 16);
  if (!isOwnedFilingPath(path, userSeg)) {
    return NextResponse.json({ enabled: true, error: "bad_path" }, { status: 400 });
  }

  if (limited(String(jwt.sub))) {
    return NextResponse.json({ enabled: true, error: "rate_limited" }, { status: 429 });
  }

  return NextResponse.json(
    { enabled: true, url: presignFilingGet(storage, path) },
    // A signed URL is a bearer credential: never cache one.
    { headers: { "Cache-Control": "no-store" } }
  );
}
