import { describe, expect, it } from "vitest";

import {
  dataUrlBytes,
  dataUrlToBlob,
  fitWithin,
  mimeOf,
} from "@/lib/image";

describe("fitWithin", () => {
  it("leaves images already within the cap untouched", () => {
    expect(fitWithin(800, 600, 1400)).toEqual({ w: 800, h: 600 });
    expect(fitWithin(1400, 900, 1400)).toEqual({ w: 1400, h: 900 });
  });

  it("scales the longest edge down to the cap, preserving aspect", () => {
    expect(fitWithin(4000, 3000, 1400)).toEqual({ w: 1400, h: 1050 });
    expect(fitWithin(3000, 4000, 1400)).toEqual({ w: 1050, h: 1400 }); // portrait
  });

  it("never upscales and is defensive about junk dimensions", () => {
    expect(fitWithin(100, 100, 1400)).toEqual({ w: 100, h: 100 });
    expect(fitWithin(0, 500, 1400)).toEqual({ w: 0, h: 0 });
  });
});

describe("dataUrlBytes", () => {
  it("estimates decoded size from the base64 payload", () => {
    // "AAAA" (4 base64 chars) → 3 bytes
    expect(dataUrlBytes("data:image/webp;base64,AAAA")).toBe(3);
    expect(dataUrlBytes("data:image/webp;base64,AAAAAAAA")).toBe(6);
  });
});

describe("mimeOf", () => {
  it("reads the MIME from a data: URL, defaulting to webp", () => {
    expect(mimeOf("data:image/webp;base64,AAAA")).toBe("image/webp");
    expect(mimeOf("data:image/jpeg;base64,AAAA")).toBe("image/jpeg");
    expect(mimeOf("not-a-data-url")).toBe("image/webp");
  });
});

describe("dataUrlToBlob", () => {
  it("decodes base64 into a typed Blob of the right size", () => {
    // "SGk=" is base64 for "Hi" (2 bytes)
    const blob = dataUrlToBlob("data:image/jpeg;base64,SGk=");
    expect(blob.size).toBe(2);
    expect(blob.type).toBe("image/jpeg");
  });
});
