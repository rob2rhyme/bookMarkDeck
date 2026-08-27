import { describe, expect, it } from "vitest";

import {
  categorySuggestions,
  cleanQuery,
  searchFiling,
  unfiled,
  type SearchInput,
} from "@/features/filing/lib/filingSearch";
import type {
  FilingDocument,
  FilingFolder,
  FilingPlace,
} from "@/features/filing/lib/types";

const place = (id: string, name: string, parentId: string | null = null): FilingPlace => ({
  id, name, parentId, createdAt: null, updatedAt: null,
});

const folder = (over: Partial<FilingFolder> & { id: string; name: string }): FilingFolder => ({
  homePlaceId: "d2", currentPlaceId: null, parentId: null,
  aliases: [], tags: [], createdAt: null, updatedAt: null, ...over,
});

const doc = (over: Partial<FilingDocument> & { id: string; title: string }): FilingDocument => ({
  folderId: "vehicles", obligations: [], aliases: [], tags: [],
  createdAt: null, updatedAt: null, ...over,
});

const DATA: SearchInput = {
  places: [
    place("garage", "Garage"),
    place("cab", "Grey cabinet", "garage"),
    place("d2", "Drawer 2", "cab"),
  ],
  folders: [
    folder({ id: "vehicles", name: "Vehicles", aliases: ["car", "auto", "Taurus"],
             category: "Property" }),
    folder({ id: "taxes", name: "2024 Taxes", category: "Tax" }),
    folder({ id: "old", name: "Vehicles archive", archived: true }),
  ],
  documents: [
    doc({ id: "title", title: "Certificate of title" }),
    doc({ id: "reg", title: "Registration renewal", reference: "PLT-8891" }),
    doc({ id: "w2", title: "W-2", folderId: "taxes" }),
    doc({ id: "loose", title: "Unsorted letter", folderId: null }),
    doc({ id: "gone", title: "Old title", archived: true }),
  ],
};

describe("cleanQuery", () => {
  it("strips the natural-language wrapper people actually type", () => {
    expect(cleanQuery("Where's my car title?")).toBe("car title");
    expect(cleanQuery("find the W-2")).toBe("w-2");
    expect(cleanQuery("  Taxes  ")).toBe("taxes");
  });
});

describe("searchFiling", () => {
  it("answers with a full trail ending in the folder you pull", () => {
    const [top] = searchFiling(DATA, "vehicles");
    expect(top.kind).toBe("folder");
    expect(top.trail).toEqual(["Garage", "Grey cabinet", "Drawer 2", "Vehicles"]);
  });

  it("finds a folder by an alias — the thing a Places link cannot do", () => {
    for (const q of ["car", "auto", "taurus"]) {
      const hit = searchFiling(DATA, q).find((h) => h.kind === "folder");
      expect(hit, `alias "${q}" should find the folder`).toBeDefined();
      expect(hit && hit.kind === "folder" && hit.folder.id).toBe("vehicles");
    }
  });

  it("surfaces documents in a matching folder even when the paper is named differently", () => {
    const hits = searchFiling(DATA, "car");
    const titles = hits.filter((h) => h.kind === "document").map((h) => h.document.title);
    expect(titles).toContain("Certificate of title");
  });

  it("matches a document by its reference number", () => {
    const [top] = searchFiling(DATA, "PLT-8891");
    expect(top.kind === "document" && top.document.id).toBe("reg");
  });

  it("ranks an exact title above an inherited folder match", () => {
    const hits = searchFiling(DATA, "certificate of title");
    expect(hits[0].kind === "document" && hits[0].document.id).toBe("title");
  });

  it("tolerates a word-order slip", () => {
    const hits = searchFiling(DATA, "renewal registration");
    expect(hits.some((h) => h.kind === "document" && h.document.id === "reg")).toBe(true);
  });

  it("skips archived folders and documents", () => {
    const hits = searchFiling(DATA, "old title");
    expect(hits.some((h) => h.kind === "document" && h.document.id === "gone")).toBe(false);
    expect(hits.some((h) => h.kind === "folder" && h.folder.id === "old")).toBe(false);
  });

  it("gives an unfiled document an empty trail rather than a wrong one", () => {
    const hit = searchFiling(DATA, "unsorted letter")[0];
    expect(hit.kind).toBe("document");
    expect(hit.trail).toEqual([]);
  });

  it("returns nothing for a query too short to be meaningful", () => {
    expect(searchFiling(DATA, "a")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchFiling(DATA, "e", 2).length).toBeLessThanOrEqual(2);
  });
});

describe("unfiled", () => {
  it("returns only live documents with no folder", () => {
    expect(unfiled(DATA.documents).map((d) => d.id)).toEqual(["loose"]);
  });
});

describe("categorySuggestions", () => {
  it("returns sorted unique categories", () => {
    expect(categorySuggestions(DATA.folders)).toEqual(["Property", "Tax"]);
  });
});
