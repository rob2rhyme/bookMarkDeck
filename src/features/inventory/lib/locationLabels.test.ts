import { describe, expect, it } from "vitest";

import {
  labelUrl,
  locationLabelsHtml,
  type LocationLabel,
} from "@/features/inventory/lib/locationLabels";

describe("labelUrl", () => {
  it("builds an absolute deep link, trimming a trailing slash", () => {
    expect(labelUrl("https://app.example.com", "loc1")).toBe(
      "https://app.example.com/inventory?location=loc1"
    );
    expect(labelUrl("https://app.example.com/", "a b")).toBe(
      "https://app.example.com/inventory?location=a%20b"
    );
  });
});

describe("locationLabelsHtml", () => {
  const labels: LocationLabel[] = [
    {
      id: "1",
      name: "Garage",
      path: ["Home", "Garage"],
      count: 3,
      qrSvg: "<svg data-qr></svg>",
    },
    { id: "2", name: "Junk & bits", path: ["Junk & bits"], count: 1, qrSvg: "<svg></svg>" },
  ];

  it("embeds each label's QR, name, count, and parent path", () => {
    const html = locationLabelsHtml(labels);
    expect(html).toContain("<svg data-qr></svg>");
    expect(html).toContain("Garage");
    expect(html).toContain("Home"); // parent breadcrumb (path minus leaf)
    expect(html).toContain("3 items");
    expect(html).toContain("1 item"); // singular
  });

  it("escapes HTML-special characters in names", () => {
    const html = locationLabelsHtml(labels);
    expect(html).toContain("Junk &amp; bits");
    expect(html).not.toContain("Junk & bits");
  });
});
