// src/auth/auth.config.ts
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authConfig: NextAuthOptions = {
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
