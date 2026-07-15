import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export const runtime = "nodejs";

/**
 * Returns the signed-in user's Google OIDC id_token so the browser can bridge
 * the single next-auth Google login into Firebase Auth (see FirebaseSyncBridge)
 * — one login then syncs every pillar (Bookmarks, Focus, Habits, My Stuff).
 *
 * The id_token is an identity assertion (email/sub/name), not the Google API
 * access token — which stays server-side, never on the session. The route is
 * gated by the next-auth JWT, so a user only ever receives their own token.
 */
export async function GET(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const idToken = jwt?.idToken ?? null;
  return NextResponse.json(
    { idToken },
    { headers: { "Cache-Control": "no-store" } }
  );
}
