import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { fetchHtml } from "@/lib/fetchPage";
import { createRateLimiter } from "@/lib/rateLimit";
import { extractArticle, isReadable } from "@/lib/readerExtract";
import { isUnsafeUrl } from "@/utils/normalizeUrl";

export const runtime = "nodejs";
export const maxDuration = 20;

// Each call makes the server fetch and parse someone else's page.
const limited = createRateLimiter(60_000, 20);
const MAX_URL = 2048;
const MAX_PAGE_BYTES = 1_500_000;

/**
 * Reader view: `?url=` in, `{ article }` out — the page's readable text as plain
 * blocks (never HTML), or `{ article: null }` when the page can't be fetched or
 * has nothing to read. An unreadable page is an answer, not an error. Nothing is
 * stored: the page is fetched fresh, so what's shown is what's there now.
 * Session-gated; the fetch reaches only public addresses (`@/lib/fetchPage`).
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

  const page = await fetchHtml(raw, { maxBytes: MAX_PAGE_BYTES, timeoutMs: 8_000 });
  const article = page ? extractArticle(page.html) : null;
  const readable = article && isReadable(article) ? { ...article, truncated: article.truncated || page!.truncated } : null;
  return NextResponse.json(
    { article: readable },
    { headers: { "Cache-Control": "private, max-age=600" } }
  );
}
