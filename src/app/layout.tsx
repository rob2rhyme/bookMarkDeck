// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { GlobalClientUI } from "./GlobalClientUI";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Bookmark Deck",
  description: "A simple bookmark manager",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
          <GlobalClientUI />
        </Providers>
      </body>
    </html>
  );
}
