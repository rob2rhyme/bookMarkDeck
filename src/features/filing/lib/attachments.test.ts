import { describe, expect, it } from "vitest";

import {
  ACCEPTED_TYPES,
  ACCEPT_ATTR,
  FAILURE_MESSAGES,
  formatBytes,
  isImage,
  sortAttachments,
} from "@/features/filing/lib/attachments";
import type { FilingAttachment } from "@/features/filing/lib/types";

const att = (over: Partial<FilingAttachment> = {}): FilingAttachment => ({
  id: "a1",
  documentId: "d1",
  name: "scan.pdf",
  contentType: "application/pdf",
  size: 1024,
  path: "filing/abc/d1/x.pdf",
  url: "https://cdn.example/filing/abc/d1/x.pdf",
  addedAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

describe("accepted types", () => {
  it("covers PDFs as well as images — a scan is usually one or the other", () => {
    expect(ACCEPTED_TYPES).toContain("application/pdf");
    expect(ACCEPTED_TYPES).toContain("image/jpeg");
    expect(ACCEPTED_TYPES).toContain("image/heic");
  });

  it("excludes the types that execute when served from the bucket domain", () => {
    // The public bucket is a different origin from the app; SVG and HTML would
    // run script there.
    expect(ACCEPTED_TYPES).not.toContain("image/svg+xml");
    expect(ACCEPTED_TYPES).not.toContain("text/html");
  });

  it("builds an accept attribute the file picker can use", () => {
    expect(ACCEPT_ATTR.split(",")).toEqual([...ACCEPTED_TYPES]);
  });
});

describe("isImage", () => {
  it("separates renderable images from documents", () => {
    expect(isImage("image/jpeg")).toBe(true);
    expect(isImage("application/pdf")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("scales the unit to the size", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("handles the boundaries without a unit that reads wrong", () => {
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(0)).toBe("0 B");
  });
});

describe("sortAttachments", () => {
  it("puts the newest first — the scan you just added", () => {
    const out = sortAttachments([
      att({ id: "old", addedAt: "2026-01-01T00:00:00.000Z" }),
      att({ id: "new", addedAt: "2026-08-01T00:00:00.000Z" }),
    ]);
    expect(out.map((a) => a.id)).toEqual(["new", "old"]);
  });

  it("does not mutate its input", () => {
    const input = [att({ id: "a", addedAt: "2026-01-01T00:00:00.000Z" }), att({ id: "b" })];
    const copy = [...input];
    sortAttachments(input);
    expect(input).toEqual(copy);
  });

  it("tolerates a missing timestamp rather than throwing", () => {
    const out = sortAttachments([att({ id: "none", addedAt: null }), att({ id: "dated" })]);
    expect(out.map((a) => a.id)).toEqual(["dated", "none"]);
  });
});

describe("failure messages", () => {
  it("has a message for every failure the upload can return", () => {
    for (const reason of ["disabled", "unsupported_type", "too_large", "rate_limited", "failed"] as const) {
      expect(FAILURE_MESSAGES[reason]).toBeTruthy();
    }
  });
});
