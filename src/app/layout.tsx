// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Bookmark Deck",
  description: "A simple bookmark manager",
  applicationName: "Bookmark Deck",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bookmark Deck",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  // iOS Safari auto-zooms the page when a focused input's font-size is under
  // 16px, leaving the layout zoomed + horizontally pannable (modals appear to
  // drift sideways). maximumScale suppresses that *automatic* zoom app-wide;
  // Safari still allows user-initiated pinch zoom, so accessibility is intact.
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
