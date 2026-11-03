import http from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { fetchPageTitle } from "@/lib/fetchPageTitle";

// A real server on 127.0.0.1. The default address rule refuses it — which is the
// first thing tested — so the other tests allow loopback explicitly.
let server: http.Server;
let base: string;
let hits: string[];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push(req.url ?? "");
    const route = req.url ?? "/";
    if (route === "/page") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end("<html><head><title>Hello &amp; welcome</title></head><body>…</body></html>");
    }
    if (route === "/gzip") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      return res.end(gzipSync("<head><meta property='og:title' content='Zipped'></head>"));
    }
    if (route === "/json") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end('{"title":"no"}');
    }
    if (route === "/missing") {
      res.writeHead(404, { "content-type": "text/html" });
      return res.end("<title>Not found</title>");
    }
    if (route === "/hop") {
      res.writeHead(302, { location: "/page" });
      return res.end();
    }
    if (route === "/to-private") {
      res.writeHead(302, { location: "http://10.0.0.1/admin" });
      return res.end();
    }
    if (route.startsWith("/loop")) {
      res.writeHead(302, { location: `/loop${hits.length}` });
      return res.end();
    }
    if (route === "/huge") {
      res.writeHead(200, { "content-type": "text/html" });
      res.write("<html><head>");
      res.write(" ".repeat(400 * 1024));
      return res.end("<title>Too late</title></head>");
    }
    res.writeHead(500);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  hits = [];
});

const loopbackOnly = { allowAddress: (ip: string) => ip === "127.0.0.1", anyPort: true };

describe("fetchPageTitle", () => {
  it("refuses a loopback address by default, without connecting", async () => {
    expect(await fetchPageTitle(`${base}/page`, { anyPort: true })).toBeNull();
    expect(hits).toEqual([]);
  });

  it("refuses a name that resolves to loopback, at connect time", async () => {
    const port = (server.address() as AddressInfo).port;
    expect(await fetchPageTitle(`http://localhost:${port}/page`, { anyPort: true })).toBeNull();
    expect(hits).toEqual([]);
  });

  it("refuses non-default ports unless told otherwise", async () => {
    expect(await fetchPageTitle(`${base}/page`, { allowAddress: () => true })).toBeNull();
    expect(hits).toEqual([]);
  });

  it("refuses other schemes and credentials in the URL", async () => {
    expect(await fetchPageTitle("ftp://example.com/x", loopbackOnly)).toBeNull();
    expect(await fetchPageTitle(`${base.replace("//", "//user:pw@")}/page`, loopbackOnly)).toBeNull();
    expect(hits).toEqual([]);
  });

  it("reads the title of an allowed page", async () => {
    expect(await fetchPageTitle(`${base}/page`, loopbackOnly)).toBe("Hello & welcome");
  });

  it("decompresses a gzipped page", async () => {
    expect(await fetchPageTitle(`${base}/gzip`, loopbackOnly)).toBe("Zipped");
  });

  it("is null for something that isn't an HTML page, or an error page", async () => {
    expect(await fetchPageTitle(`${base}/json`, loopbackOnly)).toBeNull();
    expect(await fetchPageTitle(`${base}/missing`, loopbackOnly)).toBeNull();
  });

  it("follows a redirect", async () => {
    expect(await fetchPageTitle(`${base}/hop`, loopbackOnly)).toBe("Hello & welcome");
    expect(hits).toEqual(["/hop", "/page"]);
  });

  it("re-checks every redirect: one into a private network is refused", async () => {
    expect(await fetchPageTitle(`${base}/to-private`, loopbackOnly)).toBeNull();
    expect(hits).toEqual(["/to-private"]);
  });

  it("gives up after three redirects", async () => {
    expect(await fetchPageTitle(`${base}/loop`, loopbackOnly)).toBeNull();
    expect(hits).toHaveLength(4);
  });

  it("stops reading at the size cap", async () => {
    expect(await fetchPageTitle(`${base}/huge`, loopbackOnly)).toBeNull();
  });

  it("is null for a URL that doesn't parse", async () => {
    expect(await fetchPageTitle("not a url")).toBeNull();
  });
});
