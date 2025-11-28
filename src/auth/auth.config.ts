// src/auth/auth.config.ts
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const vercelUrl = process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`;
if (!process.env.NEXTAUTH_URL && vercelUrl) {
  // Ensure NextAuth constructs the callback URL with the deployed host when NEXTAUTH_URL is missing.
  process.env.NEXTAUTH_URL = vercelUrl;
}

export const authConfig: NextAuthOptions = {
  // Used for session integrity; required when deploying auth callbacks.
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.picture = (profile as { picture?: string })?.picture;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.picture && session.user) session.user.image = token.picture as string;
      return session;
    },
  },
};

export default authConfig;
