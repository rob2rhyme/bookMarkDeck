import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACCEPTED_TYPES,
  ACCEPT_ATTR,
  FAILURE_MESSAGES,
  READ_FAILURE_MESSAGES,
  fetchStored,
  formatBytes,
  isImage,
  readUrl,
  sortAttachments,
  uploadAttachment,
} from "@/features/filing/lib/attachments";
import type { FilingAttachment } from "@/features/filing/lib/types";

const att = (over: Partial<FilingAttachment> = {}): FilingAttachment => ({
  id: "a1",
  documentId: "d1",
  name: "scan.pdf",
  contentType: "application/pdf",
  size: 1024,
  path: "filing/abc/d1/x.pdf",
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


afterEach(() => vi.unstubAllGlobals());

type Call = { url: string; init?: RequestInit };
/** A fetch that answers from a queue and records what it was asked. */
function stubFetch(...answers: Array<Response | Error>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next ?? new Response("{}");
    })
  );
  return calls;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("uploadAttachment", () => {
  const body = new Blob([new Uint8Array(10)], { type: "application/octet-stream" });

  it("declares the STORED size and the ORIGINAL type, and PUTs with the type the route signed", async () => {
    const calls = stubFetch(
      json({ enabled: true, uploadUrl: "https://r2.test/put", uploadContentType: "application/octet-stream", path: "filing/x/d1/y.bin" }),
      new Response(null, { status: 200 })
    );
    const out = await uploadAttachment({ body, contentType: "application/pdf", documentId: "d1", encrypted: true });
    expect(out).toEqual({ ok: true, result: { path: "filing/x/d1/y.bin" } });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ documentId: "d1", contentType: "application/pdf", size: 10, encrypted: true });
    expect(calls[1].url).toBe("https://r2.test/put");
    expect((calls[1].init?.headers as Record<string, string>)["Content-Type"]).toBe("application/octet-stream");
  });

  it("a plain upload falls back to the file's own type", async () => {
    const calls = stubFetch(json({ enabled: true, uploadUrl: "https://r2.test/put", path: "filing/x/d1/y.pdf" }), new Response(null));
    await uploadAttachment({ body, contentType: "application/pdf", documentId: "d1" });
    expect((calls[1].init?.headers as Record<string, string>)["Content-Type"]).toBe("application/pdf");
    expect(JSON.parse(String(calls[0].init?.body)).encrypted).toBe(false);
  });

  it("maps every refusal, and a failed PUT or a dropped network, to a reason", async () => {
    const reasons = async (...a: Array<Response | Error>) => {
      stubFetch(...a);
      const out = await uploadAttachment({ body, contentType: "application/pdf", documentId: "d1" });
      return out.ok ? "ok" : out.reason;
    };
    expect(await reasons(json({ enabled: false }))).toBe("disabled");
    expect(await reasons(json({ enabled: true, error: "unsupported_type" }))).toBe("unsupported_type");
    expect(await reasons(json({ enabled: true, error: "too_large" }))).toBe("too_large");
    expect(await reasons(json({ enabled: true, error: "rate_limited" }))).toBe("rate_limited");
    expect(await reasons(json({ enabled: true }))).toBe("failed"); // no upload url
    expect(await reasons(json({ enabled: true, uploadUrl: "u", path: "p" }), new Response(null, { status: 403 }))).toBe("failed");
    expect(await reasons(new Error("offline"))).toBe("failed");
  });
});

describe("readUrl / fetchStored", () => {
  it("asks the route for the path and returns its signed URL", async () => {
    const calls = stubFetch(json({ enabled: true, url: "https://r2.test/get?sig" }));
    expect(await readUrl("filing/x/d1/y.bin")).toEqual({ ok: true, url: "https://r2.test/get?sig" });
    expect(calls[0].url).toBe("/api/filing/attachment/read");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ path: "filing/x/d1/y.bin" });
  });

  it("maps disabled, rate-limited, a bad path and a dropped network to reasons", async () => {
    const reason = async (a: Response | Error) => {
      stubFetch(a);
      const r = await readUrl("p");
      return r.ok ? "ok" : r.reason;
    };
    expect(await reason(json({ enabled: false }))).toBe("disabled");
    expect(await reason(json({ enabled: true, error: "rate_limited" }))).toBe("rate_limited");
    expect(await reason(json({ enabled: true, error: "bad_path" }, 400))).toBe("failed");
    expect(await reason(new Error("offline"))).toBe("failed");
  });

  it("fetchStored downloads from the signed URL, and fails if that fails", async () => {
    stubFetch(json({ enabled: true, url: "https://r2.test/get" }), new Response(new Uint8Array([1, 2, 3])));
    const ok = await fetchStored("p");
    expect(ok.ok && new Uint8Array(ok.bytes)).toEqual(new Uint8Array([1, 2, 3]));

    stubFetch(json({ enabled: true, url: "https://r2.test/get" }), new Response(null, { status: 403 }));
    expect(await fetchStored("p")).toEqual({ ok: false, reason: "failed" });
    stubFetch(json({ enabled: true, url: "https://r2.test/get" }), new Error("cors"));
    expect(await fetchStored("p")).toEqual({ ok: false, reason: "failed" });
  });

  it("has a message for every read failure", () => {
    for (const k of ["disabled", "rate_limited", "failed"] as const) expect(READ_FAILURE_MESSAGES[k].length).toBeGreaterThan(5);
  });
});
