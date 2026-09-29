// The paper form's working copy. Pure — see documentDraft.test.ts.

import type { DocType, FilingDocument } from "@/features/filing/lib/types";

export type DocumentDraft = {
  title: string;
  folderId: string | null;
  partyId: string | null;
  docType: DocType | "";
  docDate: string;
  reference: string;
  aliases: string;
  note: string;
};

export const EMPTY_DRAFT: DocumentDraft = {
  title: "",
  folderId: null,
  partyId: null,
  docType: "",
  docDate: "",
  reference: "",
  aliases: "",
  note: "",
};

export function draftFor(d: FilingDocument): DocumentDraft {
  return {
    title: d.title,
    folderId: d.folderId,
    partyId: d.partyId ?? null,
    docType: d.docType ?? "",
    docDate: d.docDate ?? "",
    reference: d.reference ?? "",
    aliases: d.aliases.join(", "),
    note: d.note ?? "",
  };
}

/**
 * The fields the user actually changed. An edit saves only these: the form is
 * seeded once, when it opens, and a field left alone must not write that seed
 * back over a newer copy — a paper opened before its cloud copy arrived had no
 * note, reference or aliases to show, and saving the title would have erased
 * all three.
 */
export function changedFields(seed: DocumentDraft, draft: DocumentDraft): (keyof DocumentDraft)[] {
  return (Object.keys(draft) as (keyof DocumentDraft)[]).filter((k) => draft[k] !== seed[k]);
}
