import type { Metadata } from "next";

// Client page — see the note in ../../(app)/folders/manage/layout.tsx.
export const metadata: Metadata = { title: "Sign in" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
