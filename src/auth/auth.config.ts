// src/auth/auth.config.ts
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { isAllowedEmail } from "./allowlist";

/**
 * Resolve the public origin NextAuth builds the Google callback URL from.
 * Order matters: an explicit NEXTAUTH_URL wins, then Vercel's *stable*
 * production domain. VERCEL_URL is last because it is the per-deployment host
 * (`<project>-<hash>.vercel.app`) — it changes on every deploy, so it can never
 * be registered in the Google OAuth client and always fails with
 * `redirect_uri_mismatch`. A trailing slash is stripped for the same reason:
 * it would yield `https://host//api/auth/callback/google`, which Google
 * compares byte-for-byte against the registered URI and rejects.
 */
function resolveBaseUrl(): { url?: string; source: string | null } {
  const candidates: Array<[string, string | undefined]> = [
    ["NEXTAUTH_URL", process.env.NEXTAUTH_URL],
    [
      "VERCEL_PROJECT_PRODUCTION_URL",
      process.env.VERCEL_PROJECT_PRODUCTION_URL &&
        `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    ],
    [
      "VERCEL_URL",
      process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    ],
  ];
  for (const [source, raw] of candidates) {
    if (raw) return { url: raw.replace(/\/+$/, ""), source };
  }
  return { source: null };
}

// Resolved once, at module load — deliberately BEFORE the assignment below.
// Reading process.env later would always report "NEXTAUTH_URL" as the source,
// because we set it ourselves here, hiding the VERCEL_URL misconfiguration.
const resolved = resolveBaseUrl();

export const NEXTAUTH_BASE_URL = resolved.url;

/** Which env var the base URL came from — surfaced by /api/auth-diagnostics. */
export const NEXTAUTH_BASE_URL_SOURCE = resolved.source;

if (NEXTAUTH_BASE_URL && process.env.NEXTAUTH_URL !== NEXTAUTH_BASE_URL) {
  process.env.NEXTAUTH_URL = NEXTAUTH_BASE_URL;
}

/**
 * The exact `redirect_uri` NextAuth sends to Google — this string must be
 * registered verbatim on the OAuth client. Mirrors next-auth v4's own
 * resolution: a bare origin gets the default `/api/auth` base path; an explicit
 * path in NEXTAUTH_URL is used as-is.
 */
export function googleCallbackUrl(
  baseUrl = NEXTAUTH_BASE_URL
): string | undefined {
  if (!baseUrl) return undefined;
  try {
    const url = new URL(baseUrl);
    const basePath = url.pathname.replace(/\/+$/, "") || "/api/auth";
    return `${url.origin}${basePath}/callback/google`;
  } catch {
    return undefined;
  }
}

// Scopes: minimal identity + Google Tasks (the to-do list) + Calendar events
// (timed to-dos). `access_type=offline` + `prompt=consent` are required to get
// a refresh token so the access token can be renewed server-side.
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/calendar.events",
  // Read events across all the user's calendars (for the agenda / events-in-list).
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

const TOKEN_URL = "https://oauth2.googleapis.com/token";

type RefreshableToken = {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string; // Google OIDC id_token — bridged into Firebase Auth client-side
  expiresAt?: number; // epoch ms
  error?: string;
  picture?: string;
  [key: string]: unknown;
};

/** Exchange the refresh token for a fresh access token (Google). */
async function refreshAccessToken(
  token: RefreshableToken
): Promise<RefreshableToken> {
  if (!token.refreshToken) return { ...token, error: "NoRefreshToken" };
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return {
      ...token,
      accessToken: data.access_token,
      // Google returns a fresh id_token on refresh (openid scope) — keep it so
      // the Firebase bridge stays usable beyond the first hour after login.
      idToken: data.id_token ?? token.idToken,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authConfig: NextAuthOptions = {
  // Used for session integrity; required when deploying auth callbacks.
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  // 14 days, not next-auth's 30. The cookie carries the Google refresh token
  // (Tasks + Calendar), so a copied cookie is worth less for less long. The
  // expiry slides: every visit re-issues the cookie, so this is 14 days of NOT
  // using the app, not a fortnightly sign-in.
  session: { strategy: "jwt", maxAge: 14 * 24 * 60 * 60 },
  // A refused sign-in lands back on /login?error=AccessDenied, which explains
  // why, instead of next-auth's unstyled error page.
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Only the owner's account (src/auth/allowlist.ts), and only with an email
    // Google has verified.
    async signIn({ user, profile }) {
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
      return verified !== false && isAllowedEmail(user.email);
    },
    async jwt({ token, account, profile }) {
      const t = token as RefreshableToken;
      // Ends a session that predates the allowlist (or an account later removed
      // from it): next-auth clears the cookie when this throws, and the session
      // reads as signed out everywhere — client and server alike.
      if (!isAllowedEmail(t.email)) throw new Error("account not allowed");
      // Initial sign-in — capture tokens + expiry.
      if (account) {
        t.accessToken = account.access_token;
        t.refreshToken = account.refresh_token ?? t.refreshToken;
        t.idToken = account.id_token ?? t.idToken;
        t.expiresAt = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;
        t.picture = (profile as { picture?: string })?.picture;
        t.error = undefined;
        return t;
      }
      // Still valid (60s safety margin) — reuse.
      if (t.expiresAt && Date.now() < t.expiresAt - 60_000) return t;
      // Expired — refresh.
      return refreshAccessToken(t);
    },
    async session({ session, token }) {
      const t = token as RefreshableToken;
      if (t.picture && session.user) session.user.image = t.picture;
      // NOTE: the Google access token is intentionally NOT copied onto the
      // client-facing session. API routes read it server-side from the JWT via
      // getToken() (see src/app/api/google/*). Keeping it off the session means
      // it never ships to the browser in /api/auth/session.
      session.error = t.error;
      return session;
    },
  },
};

export default authConfig;
