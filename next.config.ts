// next.config.ts
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// 'unsafe-eval' is only needed by the dev server (HMR / fast refresh); the
// production bundle does not eval, so we drop it there to shrink XSS surface.
// 'unsafe-inline' for scripts is kept for now: removing it requires per-request
// nonces, which would force every currently-static page to render dynamically.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:"
  : "script-src 'self' 'unsafe-inline' https:";

const baseCsp = [
  "default-src 'self' https: data: blob:",
  "img-src 'self' https: data:",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https:",
  "font-src 'self' https: data:",
  "base-uri 'self'",
  "frame-ancestors 'none'",
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
