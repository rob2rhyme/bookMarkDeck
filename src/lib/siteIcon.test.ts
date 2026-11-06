import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fetchImage } from "@/lib/fetchPage";
import { fetchSiteIcon, iconHost, iconLinks, sniffIcon, type IconDeps } from "./siteIcon";

// Icons used to come from Google's icon service, which saw the domain of every
// bookmark; the fallback asked the site itself, from the user's browser. Now our
// server fetches them — through the link-title fence — and serves raster only.

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const ICO = Buffer.from([0x00, 0x00, 0x01, 0x00, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("iconHost", () => {
  it("takes a bare public hostname, lowercased", () => {
    expect(iconHost("Example.COM")).toBe("example.com");
    expect(iconHost("sub.xn--bcher-kva.de.")).toBe("sub.xn--bcher-kva.de");
  });
  it("refuses IP literals, single labels, ports, paths and junk", () => {
    for (const bad of ["127.0.0.1", "localhost", "[::1]", "example.com:8080", "example.com/x", "-a.com", "", null]) {
      expect(iconHost(bad)).toBeNull();
    }
  });
});

describe("sniffIcon", () => {
  it("knows PNG, ICO, JPEG, GIF and WebP by their bytes", () => {
    expect(sniffIcon(PNG)).toBe("image/png");
    expect(sniffIcon(ICO)).toBe("image/x-icon");
    expect(sniffIcon(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(sniffIcon(Buffer.from("GIF89a\0\0\0\0\0\0"))).toBe("image/gif");
    expect(sniffIcon(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });
  it("refuses SVG and HTML, whatever a server calls them", () => {
    expect(sniffIcon(SVG)).toBeNull();
    expect(sniffIcon(Buffer.from("<!doctype html><html>"))).toBeNull();
  });
});

describe("iconLinks", () => {
  const base = "https://example.com/";
  it("puts the touch icon first, then larger sizes, and resolves relative links", () => {
    const html = `<head>
      <link rel="icon" href="/fav-16.png" sizes="16x16">
      <link rel="shortcut icon" href="favicon.ico">
      <link rel="icon" href="//cdn.example.com/fav-64.png" sizes="64x64">
      <link rel="apple-touch-icon" href="/touch.png">
      <link rel="stylesheet" href="/x.css">
    </head>`;
    expect(iconLinks(html, base)).toEqual([
      "https://example.com/touch.png",
      "https://cdn.example.com/fav-64.png",
      "https://example.com/fav-16.png",
      "https://example.com/favicon.ico",
    ]);
  });
  it("skips SVG icons and non-http links", () => {
    const html = `<link rel="icon" type="image/svg+xml" href="/i.svg"><link rel="icon" href="/a.svg?v=2">
      <link rel="icon" href="data:image/png;base64,AAAA"><link rel="icon" href="javascript:alert(1)">`;
    expect(iconLinks(html, base)).toEqual([]);
  });
});

describe("fetchSiteIcon", () => {
  const deps = (pages: Record<string, string | null>, images: Record<string, Buffer | null>): IconDeps => ({
    html: vi.fn(async (url: string) => (pages[url] != null ? { html: pages[url]!, truncated: false } : null)),
    image: vi.fn(async (url: string) => images[url] ?? null),
    now: () => 0,
  });

  it("prefers a declared icon, and falls back to /favicon.ico", async () => {
    const d = deps({ "https://a.com/": '<link rel="icon" href="/i.png">' }, { "https://a.com/i.png": PNG });
    expect((await fetchSiteIcon("a.com", d))?.type).toBe("image/png");
    const e = deps({ "https://b.com/": null }, { "https://b.com/favicon.ico": ICO });
    expect((await fetchSiteIcon("b.com", e))?.type).toBe("image/x-icon");
  });

  it("moves past an icon that isn't a raster image", async () => {
    const d = deps(
      { "https://a.com/": '<link rel="icon" href="/i.png">' },
      { "https://a.com/i.png": SVG, "https://a.com/favicon.ico": ICO }
    );
    expect((await fetchSiteIcon("a.com", d))?.type).toBe("image/x-icon");
  });

  it("always tries /favicon.ico, however many icons a page declares", async () => {
    const links = [1, 2, 3, 4, 5].map((n) => `<link rel="icon" href="/i${n}.png">`).join("");
    const d = deps({ "https://a.com/": links }, { "https://a.com/favicon.ico": ICO });
    expect((await fetchSiteIcon("a.com", d))?.type).toBe("image/x-icon");
    expect(d.image).toHaveBeenCalledTimes(4);
  });

  it("answers null when nothing serves", async () => {
    expect(await fetchSiteIcon("a.com", deps({}, {}))).toBeNull();
  });
});

describe("fetchImage, through the real fence", () => {
  let server: http.Server;
  let base = "";
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/icon.png") return res.writeHead(200, { "content-type": "image/png" }).end(PNG);
      if (req.url === "/big.png") return res.writeHead(200, { "content-type": "image/png" }).end(Buffer.alloc(200_000));
      if (req.url === "/page") return res.writeHead(200, { "content-type": "text/html" }).end("<html></html>");
      if (req.url === "/hop") return res.writeHead(302, { location: "/icon.png" }).end();
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  const loopbackOnly = { allowAddress: (ip: string) => ip === "127.0.0.1", anyPort: true };

  it("reads an image, following a redirect", async () => {
    expect(await fetchImage(`${base}/hop`, loopbackOnly)).toEqual(PNG);
  });
  it("refuses a page, an oversized image, and a private address", async () => {
    expect(await fetchImage(`${base}/page`, loopbackOnly)).toBeNull();
    expect(await fetchImage(`${base}/big.png`, { ...loopbackOnly, maxBytes: 100 * 1024 })).toBeNull();
    expect(await fetchImage(`${base}/icon.png`, { anyPort: true })).toBeNull();
  });
});
