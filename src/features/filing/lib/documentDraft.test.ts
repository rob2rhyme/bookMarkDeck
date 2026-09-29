import { describe, expect, it } from "vitest";

import { changedFields, draftFor } from "@/features/filing/lib/documentDraft";
import type { FilingDocument } from "@/features/filing/lib/types";

const DOC: FilingDocument = {
  id: "d1",
  title: "Passport",
  folderId: "f1",
  reference: "P123",
  aliases: ["travel", "id"],
  tags: [],
  note: "Top drawer",
  obligations: [],
  createdAt: null,
  updatedAt: null,
};

describe("changedFields", () => {
  it("is empty when nothing was touched", () => {
    expect(changedFields(draftFor(DOC), draftFor(DOC))).toEqual([]);
  });

  it("names only the fields that moved", () => {
    const draft = { ...draftFor(DOC), title: "Passport (renewed)" };
    expect(changedFields(draftFor(DOC), draft)).toEqual(["title"]);
  });

  // The bug this exists for: a form opened on a paper whose note, reference and
  // aliases hadn't loaded yet was seeded blank, and saving the title wrote the
  // blanks over the real values.
  it("leaves fields the form was seeded blank for alone", () => {
    const partial: FilingDocument = { ...DOC, reference: undefined, aliases: [], note: undefined };
    const draft = { ...draftFor(partial), title: "Passport (renewed)" };
    expect(changedFields(draftFor(partial), draft)).toEqual(["title"]);
  });

  it("counts clearing a field as a change", () => {
    const draft = { ...draftFor(DOC), note: "" };
    expect(changedFields(draftFor(DOC), draft)).toEqual(["note"]);
  });
});
