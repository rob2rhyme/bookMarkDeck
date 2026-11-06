import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { purgeFilingObjects } from "./attachments";
import { flushScanPurges, purgeScans, queuedScanPurges, queueScanPurge, type PurgeDeps } from "./scanPurge";
import type { FilingAttachment } from "./types";

// Deleting a paper used to delete the record only: its scan pointers and stored files
// stayed behind. The purge removes them — files first, since a pointer is the only way
// to find its file — and keeps the paper queued until the server confirms both are gone.
const EMAIL = "me@example.com";
const scan = (id: string, documentId = "p1"): FilingAttachment =>
  ({ id, documentId, name: id, contentType: "application/pdf", size: 1, path: `filing/u/${id}.bin` }) as FilingAttachment;

function deps(over: Partial<PurgeDeps> = {}): PurgeDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    list: vi.fn(async () => [scan("a"), scan("b")]),
    deleteFiles: vi.fn(async (paths: string[]) => {
      calls.push(`files:${paths.join(",")}`);
      return true;
    }),
    deletePointer: vi.fn(async (id: string) => {
      calls.push(`pointer:${id}`);
    }),
    ...over,
  };
}

beforeEach(() => localStorage.clear());

describe("purgeScans", () => {
  it("deletes the files, then the pointers", async () => {
    const d = deps();
    expect(await purgeScans("p1", d)).toBe(true);
    expect(d.calls).toEqual(["files:filing/u/a.bin,filing/u/b.bin", "pointer:a", "pointer:b"]);
  });

  it("keeps the pointers when a file can't be confirmed gone", async () => {
    const d = deps({ deleteFiles: vi.fn(async () => false) });
    expect(await purgeScans("p1", d)).toBe(false);
    expect(d.deletePointer).not.toHaveBeenCalled();
  });

  it("is not done when the server can't be asked — an offline answer would say 'no scans'", async () => {
    const d = deps({ list: vi.fn(async () => Promise.reject(new Error("unavailable"))) });
    expect(await purgeScans("p1", d)).toBe(false);
  });

  it("is done at once for a paper without scans", async () => {
    const d = deps({ list: vi.fn(async () => []) });
    expect(await purgeScans("p1", d)).toBe(true);
    expect(d.deleteFiles).not.toHaveBeenCalled();
  });
});

describe("the purge queue", () => {
  it("keeps a paper queued until its purge succeeds, and drops it after", async () => {
    queueScanPurge(EMAIL, "p1");
    queueScanPurge(EMAIL, "p1");
    expect(queuedScanPurges(EMAIL)).toEqual(["p1"]);

    await flushScanPurges(EMAIL, deps({ list: vi.fn(async () => Promise.reject(new Error("offline"))) }));
    expect(queuedScanPurges(EMAIL)).toEqual(["p1"]);

    await flushScanPurges(EMAIL, deps());
    expect(queuedScanPurges(EMAIL)).toEqual([]);
  });

  it("works through several papers and leaves only the one that failed", async () => {
    queueScanPurge(EMAIL, "p1");
    queueScanPurge(EMAIL, "p2");
    await flushScanPurges(
      EMAIL,
      deps({ list: vi.fn(async (id: string) => (id === "p2" ? Promise.reject(new Error("x")) : [scan("a", id)])) })
    );
    expect(queuedScanPurges(EMAIL)).toEqual(["p2"]);
  });

  it("is per account", () => {
    queueScanPurge(EMAIL, "p1");
    expect(queuedScanPurges("other@example.com")).toEqual([]);
  });
});

describe("purgeFilingObjects", () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }));

  it("is true only when the route reports every file deleted", async () => {
    vi.stubGlobal("fetch", answer({ enabled: true, deleted: 2 }));
    expect(await purgeFilingObjects(["a", "b"])).toBe(true);
    vi.stubGlobal("fetch", answer({ enabled: true, deleted: 1 }));
    expect(await purgeFilingObjects(["a", "b"])).toBe(false);
  });

  it("is false on a failed request, and true where storage isn't set up", async () => {
    vi.stubGlobal("fetch", answer({}, false));
    expect(await purgeFilingObjects(["a"])).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await purgeFilingObjects(["a"])).toBe(false);
    vi.stubGlobal("fetch", answer({ enabled: false }));
    expect(await purgeFilingObjects(["a"])).toBe(true);
  });

  it("sends 25 at a time, the route's limit", async () => {
    const fetch = vi.fn(async (_url: string, init: { body: string }) => ({
      ok: true,
      json: async () => ({ enabled: true, deleted: JSON.parse(init.body).paths.length }),
    }));
    vi.stubGlobal("fetch", fetch);
    expect(await purgeFilingObjects(Array.from({ length: 30 }, (_, i) => `k${i}`))).toBe(true);
    expect(fetch.mock.calls.map(([, init]) => JSON.parse(init.body).paths.length)).toEqual([25, 5]);
  });
});
