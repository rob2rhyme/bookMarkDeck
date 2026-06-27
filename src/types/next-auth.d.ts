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
    expiresAt?: number;
    error?: string;
    picture?: string;
  }
}
