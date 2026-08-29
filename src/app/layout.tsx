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
  // Two entries so the OS default is right before hydration; AppearanceApplier
  // rewrites the content afterwards to match a manual light/dark override.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
  width: "device-width",
  initialScale: 1,
  // iOS Safari auto-zooms the page when a focused input's font-size is under
  // 16px, leaving the layout zoomed + horizontally pannable (modals appear to
  // drift sideways). maximumScale suppresses that *automatic* zoom app-wide;
  // Safari still allows user-initiated pinch zoom, so accessibility is intact.
  maximumScale: 1,
};

// Runs before first paint, so a light-theme user never sees a dark flash.
// AppearanceApplier takes over once React mounts; this only has to get the
// first frame right. Deliberately duplicated rather than imported — it must run
// ahead of every bundle. Kept in sync with `KEY` in lib/appearanceSettings.tsx.
// Inline is permitted by the CSP (`script-src` includes 'unsafe-inline'), so no
// nonce is needed and pages stay static.
const NO_FLASH_SCRIPT = `(function(){try{
var t="system";
var raw=localStorage.getItem("bd:appearance:v1");
if(raw){var v=JSON.parse(raw).theme;if(v==="light"||v==="dark"||v==="system")t=v;}
var light=t==="light"||(t==="system"&&window.matchMedia("(prefers-color-scheme: light)").matches);
if(light)document.documentElement.classList.add("light");
}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the script above adds a class to <html> before
    // React hydrates, so the server and client markup differ by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
