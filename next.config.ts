// next.config.ts
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// 'unsafe-eval' is only needed by the dev server (HMR / fast refresh); the
// production bundle does not eval, so we drop it there to shrink XSS surface.
// 'wasm-unsafe-eval' (prod) narrowly permits WebAssembly compilation — needed
// for the on-device receipt OCR (Tesseract.js WASM); it does NOT allow JS eval.
// 'unsafe-inline' for scripts is kept for now: removing it requires per-request
// nonces, which would force every currently-static page to render dynamically.
//
// Script HOSTS are named, not `https:` — that allowed a script from anywhere,
// which is most of what an injected <script src> needs. Each one is here for a
// reason; e2e/csp.spec.ts fails on any violation the pillars raise:
//   accounts.google.com  Google Identity Services, for Drive sync (googleDriveSync.ts)
//   apis.google.com      Firebase Auth's popup sign-in loads gapi from here
//   cdn.jsdelivr.net     Tesseract's OCR worker + core (importScripts inside the worker)
const SCRIPT_HOSTS = "https://accounts.google.com https://apis.google.com https://cdn.jsdelivr.net";
const scriptSrc = isDev
  ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${SCRIPT_HOSTS}`
  : `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${SCRIPT_HOSTS}`;

// Workers fell back to script-src, which has no blob: — and Tesseract starts its
// worker from a blob: URL, so on-device OCR (labels, receipts) was refused.
// 'self' is the service worker.
const workerSrc = "worker-src 'self' blob:";

const baseCsp = [
  "default-src 'self' https: data: blob:",
  // blob: — older Safari decodes a picked photo through a blob: URL (inventory lib/image.ts).
  "img-src 'self' https: data: blob:",
  scriptSrc,
  workerSrc,
  "style-src 'self' 'unsafe-inline' https:",
  "font-src 'self' https: data:",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  // Nothing here embeds plugins or posts a form off-site (sign-in, sign-out and
  // checkout navigate by script, not by form), so both can be shut outright.
  "object-src 'none'",
  "form-action 'self'",
];

const connectSrc = "connect-src 'self' https:";

const csp = [...baseCsp, connectSrc].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // Legacy clickjacking fallback for browsers that ignore CSP
            // frame-ancestors (which is already set to 'none' above).
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            // camera=(self): the inventory barcode scanner + receipt OCR use
            // getUserMedia same-origin (and the Capacitor WebView loads the
            // site as the top-level document, so 'self' matches). Everything
            // else is disabled.
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons/**",
      },
      {
        protocol: "https",
        hostname: "icons.duckduckgo.com",
        pathname: "/ip3/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
