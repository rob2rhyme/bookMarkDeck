import type { Metadata } from "next";

// Client page — see the note in ../manage/layout.tsx.
// Static on purpose: the folder's name is read client-side from the
// localStorage/Firestore cache, so a server-rendered title has nothing to read.
export const metadata: Metadata = { title: "Collection" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
