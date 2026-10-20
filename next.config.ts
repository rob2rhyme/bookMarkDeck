// next.config.ts
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// 'unsafe-eval' is only needed by the dev server (HMR / fast refresh); the
// production bundle does not eval, so we drop it there to shrink XSS surface.
// 'wasm-unsafe-eval' (prod) narrowly permits WebAssembly compilation — needed
// for the on-device receipt OCR (Tesseract.js WASM); it does NOT allow JS eval.
// 'unsafe-inline' for scripts is kept for now: removing it requires per-request
// nonces, which would force every currently-static page to render dynamically.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:"
  : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https:";

const baseCsp = [
  "default-src 'self' https: data: blob:",
  "img-src 'self' https: data:",
  scriptSrc,
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
