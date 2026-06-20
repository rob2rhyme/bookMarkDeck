// src/auth/auth.config.ts
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const vercelUrl = process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`;
if (!process.env.NEXTAUTH_URL && vercelUrl) {
  // Ensure NextAuth constructs the callback URL with the deployed host when NEXTAUTH_URL is missing.
  process.env.NEXTAUTH_URL = vercelUrl;
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
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, account, profile }) {
      const t = token as RefreshableToken;
      // Initial sign-in — capture tokens + expiry.
      if (account) {
        t.accessToken = account.access_token;
        t.refreshToken = account.refresh_token ?? t.refreshToken;
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
      session.accessToken = t.accessToken;
      session.error = t.error;
      return session;
    },
  },
};

export default authConfig;
