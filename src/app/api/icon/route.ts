import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { createRateLimiter } from "@/lib/rateLimit";
import { fetchSiteIcon, iconHost } from "@/lib/siteIcon";

export const runtime = "nodejs";
export const maxDuration = 15;

// A page of bookmarks asks for one icon each; the browser keeps them a week, so
// this only bites a loop or a script trying to crawl through us.
const limited = createRateLimiter(60_000, 600);

/**
 * A site's icon: `?host=` in, a PNG/JPEG/GIF/WebP/ICO out, or 404 when the site
 * offers none we'll serve. Session-gated, and fetched through the same fence as
 * link titles, so it can't be pointed at the server's own network. Kept by the
 * browser only (`private`): the route is gated, so a shared cache must not hold it.
 */
export async function GET(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!jwt) return new NextResponse(null, { status: 401 });

  const host = iconHost(req.nextUrl.searchParams.get("host"));
  if (!host) return new NextResponse(null, { status: 400 });
  if (limited(String(jwt.sub ?? jwt.email ?? "anon"))) return new NextResponse(null, { status: 429 });

  const icon = await fetchSiteIcon(host);
  if (!icon) {
    // Remembered for a day, so a site without an icon isn't asked again on every render.
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=86400" } });
  }
  return new NextResponse(new Uint8Array(icon.bytes), {
    headers: {
      "Content-Type": icon.type,
      "Cache-Control": "private, max-age=604800",
      "X-Content-Type-Options": "nosniff",
      // Opened directly, this is still only an image: nothing in it may run or load.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
