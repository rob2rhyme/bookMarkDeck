import type { Metadata } from "next";

// `page.tsx` here is a Client Component, and the `metadata` export is Server
// Components only — so the title lives in this layout rather than moving 1487
// lines of client code into a separate file just to set it.
export const metadata: Metadata = { title: "Manage collections" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
