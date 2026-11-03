import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { fetchPageTitle } from "@/lib/fetchPageTitle";
import { createRateLimiter } from "@/lib/rateLimit";
import { isUnsafeUrl } from "@/utils/normalizeUrl";

export const runtime = "nodejs";
export const maxDuration = 15;

// Each call makes the server fetch someone else's page; this stops a loop or a
// script from turning that into a crawler.
const limited = createRateLimiter(60_000, 30);
const MAX_URL = 2048;

/**
 * Names a bookmark from its page: `?url=` in, `{ title }` out (null when the page
 * gives none, or can't or mustn't be fetched — that is an answer, not an error).
 * Session-gated. The fetch reaches only public addresses (`fetchPageTitle`), so
 * the route can't be pointed at the server's own network.
 */
export async function GET(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!jwt) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!raw || raw.length > MAX_URL || isUnsafeUrl(raw) || !/^https?:\/\//i.test(raw)) {
    return NextResponse.json({ error: "bad_url" }, { status: 400 });
  }
  if (limited(String(jwt.sub ?? jwt.email ?? "anon"))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const title = await fetchPageTitle(raw);
  return NextResponse.json(
    { title },
    { headers: { "Cache-Control": "private, max-age=86400" } }
  );
}
