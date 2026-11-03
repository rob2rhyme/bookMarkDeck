import { describe, expect, it } from "vitest";

import { TITLE_MAX_CHARS, extractTitle, isPublicAddress } from "@/lib/pageTitle";

describe("extractTitle", () => {
  it("prefers og:title, in either attribute order", () => {
    expect(
      extractTitle(`<head><title>Home | Acme — We make things</title>
        <meta content="Acme" property="og:title"></head>`)
    ).toBe("Acme");
    expect(extractTitle(`<meta property='og:title' content='Single quoted'>`)).toBe("Single quoted");
  });

  it("falls back to twitter:title, then <title>", () => {
    expect(extractTitle(`<meta name="twitter:title" content="Tweet title"><title>Page</title>`)).toBe(
      "Tweet title"
    );
    expect(extractTitle(`<html><head><TITLE lang="en">\n  Plain   page\n</TITLE>`)).toBe("Plain page");
  });

  it("skips an empty og:title rather than returning blank", () => {
    expect(extractTitle(`<meta property="og:title" content="  "><title>Real</title>`)).toBe("Real");
  });

  it("decodes entities", () => {
    expect(extractTitle(`<title>Tom &amp; Jerry &#8211; &#x2764; &quot;hi&quot; &rsquo;</title>`)).toBe(
      "Tom & Jerry – ❤ \"hi\" ’"
    );
    expect(extractTitle(`<title>&bogus; stays</title>`)).toBe("&bogus; stays");
  });

  it("caps a long title", () => {
    const t = extractTitle(`<title>${"x".repeat(500)}</title>`);
    expect(t).toHaveLength(TITLE_MAX_CHARS);
    expect(t?.endsWith("…")).toBe(true);
  });

  it("is null when the page names nothing", () => {
    expect(extractTitle("<html><body>no head</body></html>")).toBeNull();
    expect(extractTitle("<title>   </title>")).toBeNull();
  });
});

describe("isPublicAddress", () => {
  it("allows public unicast addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("refuses loopback, private, link-local and the metadata service", () => {
    for (const ip of [
      "127.0.0.1",
      "127.8.9.10",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "192.0.2.1",
      "::",
      "::1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "fe80::1%eth0",
      "ff02::1",
      "2001:db8::1",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("judges the IPv4 host behind a mapped or NAT64 IPv6 address", () => {
    expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicAddress("::ffff:7f00:1")).toBe(false);
    expect(isPublicAddress("::ffff:a9fe:a9fe")).toBe(false); // 169.254.169.254
    expect(isPublicAddress("64:ff9b::a9fe:a9fe")).toBe(false);
    expect(isPublicAddress("64:ff9b::808:808")).toBe(true); // 8.8.8.8
  });

  it("refuses anything that isn't an address", () => {
    for (const s of ["", "localhost", "example.com", "1.2.3", "999.1.1.1", ":::"]) {
      expect(isPublicAddress(s), s).toBe(false);
    }
  });
});
