import { NextResponse } from "next/server";
import {
  NEXTAUTH_BASE_URL,
  NEXTAUTH_BASE_URL_SOURCE,
  googleCallbackUrl,
} from "@/auth/auth.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Prints the exact redirect URIs this deployment sends to Google, so a
 * `redirect_uri_mismatch` can be fixed by copy-paste instead of guesswork.
 *
 * Deliberately NOT session-gated: it exists for the case where sign-in itself
 * is broken, so requiring a session would make it useless. Everything returned
 * is already public — the OAuth client ID travels in every authorization URL,
 * the Firebase auth domain ships in the client bundle, and the site URL is the
 * site URL. Secrets are reported as booleans only, never values.
 */
export async function GET() {
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? null;

  // Two independent Google flows, each with its own redirect URI (see CLAUDE.md
  // "Auth — dual-layer"). Both must be registered, and a mismatch in either one
  // produces the identical "Access blocked" screen.
  const nextAuthRedirectUri = googleCallbackUrl() ?? null;
  const firebaseRedirectUri = authDomain
    ? `https://${authDomain}/__/auth/handler`
    : null;

  return NextResponse.json(
    {
      nextAuth: {
        resolvedBaseUrl: NEXTAUTH_BASE_URL ?? null,
        baseUrlSource: NEXTAUTH_BASE_URL_SOURCE,
        redirectUri: nextAuthRedirectUri,
        clientId: process.env.GOOGLE_CLIENT_ID ?? null,
        hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
        hasNextAuthSecret: Boolean(process.env.NEXTAUTH_SECRET),
      },
      firebase: {
        authDomain,
        // Sent by signInWithPopup / signInWithRedirect. The client ID used here
        // is whichever one is set on the Firebase console's Google provider —
        // NOT necessarily GOOGLE_CLIENT_ID above.
        redirectUri: firebaseRedirectUri,
      },
      driveSync: {
        // googleDriveSync.ts uses the GIS token client, which validates the
        // page origin rather than a redirect URI.
        publicClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? null,
      },
      addToGoogleConsole: {
        authorizedRedirectUris: [nextAuthRedirectUri, firebaseRedirectUri].filter(
          Boolean
        ),
        authorizedJavaScriptOrigins: [
          NEXTAUTH_BASE_URL ? new URL(NEXTAUTH_BASE_URL).origin : null,
        ].filter(Boolean),
      },
      warnings: [
        NEXTAUTH_BASE_URL_SOURCE === "VERCEL_URL" &&
          "Base URL came from VERCEL_URL, the per-deployment host — it changes every deploy and cannot be registered. Set NEXTAUTH_URL to your stable domain.",
        !process.env.GOOGLE_CLIENT_ID && "GOOGLE_CLIENT_ID is not set.",
        !process.env.NEXTAUTH_SECRET && "NEXTAUTH_SECRET is not set.",
        !authDomain && "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is not set.",
      ].filter(Boolean),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
