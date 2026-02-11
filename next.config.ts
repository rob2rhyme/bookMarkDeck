//next.congig.ts
import type { NextConfig } from "next";

const baseCsp = [
  "default-src 'self' https: data: blob:",
  "img-src 'self' https: data:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'self' 'unsafe-inline' https:",
  "font-src 'self' https: data:",
  "base-uri 'self'",
  "frame-ancestors 'none'",
];

const connectSrc =
  process.env.NODE_ENV === "production"
    ? "connect-src 'self' https:"
    : "connect-src 'self' http://127.0.0.1:47831 http://localhost:47831 https:";

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
