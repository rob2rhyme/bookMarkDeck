// Augment next-auth types with the Google access token we now persist for
// Tasks / Calendar API calls (see src/auth/auth.config.ts).
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    // accessToken lives only on the JWT (below), read server-side via getToken().
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    // Google OIDC id_token — bridged client-side into Firebase Auth so a single
    // Google login also signs the user into Firebase (see /api/firebase-token
    // + FirebaseSyncBridge). Read server-side only via getToken().
    idToken?: string;
    expiresAt?: number;
    error?: string;
    picture?: string;
  }
}
