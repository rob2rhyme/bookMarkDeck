import { describe, expect, it } from "vitest";

import { docKindLabel, suggestDocName } from "@/features/inventory/lib/documents";
import type { ItemDoc } from "@/features/inventory/lib/types";

const doc = (kind: ItemDoc["kind"]): ItemDoc => ({
  id: crypto.randomUUID(),
  itemId: "i1",
  name: "x",
  kind,
  data: "data:,",
  createdAt: null,
});

describe("docKindLabel", () => {
  it("labels known kinds and falls back to Other", () => {
    expect(docKindLabel("receipt")).toBe("Receipt");
    expect(docKindLabel("warranty")).toBe("Warranty");
    expect(docKindLabel("nope" as ItemDoc["kind"])).toBe("Other");
  });
});

describe("suggestDocName", () => {
  it("numbers past existing attachments of the same kind", () => {
    expect(suggestDocName("receipt", [])).toBe("Receipt");
    expect(suggestDocName("receipt", [doc("receipt")])).toBe("Receipt 2");
    expect(
      suggestDocName("receipt", [doc("receipt"), doc("manual"), doc("receipt")])
    ).toBe("Receipt 3");
    // a different kind starts fresh
    expect(suggestDocName("manual", [doc("receipt"), doc("receipt")])).toBe("Manual");
  });
});
