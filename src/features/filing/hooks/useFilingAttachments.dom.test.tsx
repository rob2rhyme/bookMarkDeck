import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FilingAttachment } from "@/features/filing/lib/types";

vi.mock("@/features/filing/data/filingData", () => ({
  fetchAttachments: vi.fn(),
  saveAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));
vi.mock("@/features/filing/lib/attachments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/filing/lib/attachments")>()),
  attachmentsEnabled: vi.fn(async () => true),
  deleteFilingObjects: vi.fn(),
}));

import { fetchAttachments, saveAttachment } from "@/features/filing/data/filingData";
import { deleteFilingObjects } from "@/features/filing/lib/attachments";
import { useFilingAttachments } from "./useFilingAttachments";

const OLD: FilingAttachment = {
  id: "a1",
  documentId: "d1",
  name: "scan.pdf",
  contentType: "application/pdf",
  size: 5,
  path: "filing/s/d1/old.pdf",
  url: "https://cdn/old.pdf",
  enc: null,
  addedAt: "2026-11-01T00:00:00.000Z",
};
const NEXT: FilingAttachment = {
  id: "a1",
  documentId: "d1",
  name: "Locked scan",
  contentType: "application/pdf",
  size: 5,
  path: "filing/s/d1/new.bin",
  enc: { kid: "v1", name: { kid: "v1", iv: "i", ct: "c" } },
  addedAt: "2026-11-01T00:00:00.000Z",
};

const mount = () => renderHook(() => useFilingAttachments("a@example.com", true, "d1"));

beforeEach(() => {
  vi.mocked(fetchAttachments).mockReset().mockResolvedValue([OLD]);
  vi.mocked(saveAttachment).mockReset().mockResolvedValue(undefined);
  vi.mocked(deleteFilingObjects).mockReset();
});

describe("replace (a scan that was just encrypted)", () => {
  it("swaps the pointer in place, saves it, and only THEN deletes the old object", async () => {
    const order: string[] = [];
    vi.mocked(saveAttachment).mockImplementation(async () => void order.push("save"));
    vi.mocked(deleteFilingObjects).mockImplementation(() => void order.push("delete"));
    const { result } = mount();
    await waitFor(() => expect(result.current.attachments).toEqual([OLD]));

    await act(async () => {
      await result.current.replace(NEXT, OLD.path);
    });
    expect(result.current.attachments).toEqual([NEXT]);
    expect(saveAttachment).toHaveBeenCalledWith("a@example.com", NEXT);
    expect(deleteFilingObjects).toHaveBeenCalledWith([OLD.path]);
    expect(order).toEqual(["save", "delete"]);
  });

  it("keeps the old object when the new pointer could not be saved — it is still the one in use", async () => {
    vi.mocked(saveAttachment).mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = mount();
    await waitFor(() => expect(result.current.attachments).toHaveLength(1));
    await act(async () => {
      await result.current.replace(NEXT, OLD.path);
    });
    expect(deleteFilingObjects).not.toHaveBeenCalled();
  });
});
