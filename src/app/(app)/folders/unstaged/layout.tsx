import type { Metadata } from "next";

// Client page — see the note in ../manage/layout.tsx.
export const metadata: Metadata = { title: "Unstaged bookmarks" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
