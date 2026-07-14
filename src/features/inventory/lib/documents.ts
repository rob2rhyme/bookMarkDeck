// Pure helpers for item attachments (receipts, manuals, …). The storage +
// compression live elsewhere; this is just naming/labelling — see
// documents.test.ts.

import {
  DOC_KINDS,
  type ItemDoc,
  type ItemDocKind,
} from "@/features/inventory/lib/types";

export function docKindLabel(kind: ItemDocKind): string {
  return DOC_KINDS.find((k) => k.id === kind)?.label ?? "Other";
}

/**
 * A friendly default name for a new attachment of `kind`, numbered past any
 * existing ones of the same kind: "Receipt", then "Receipt 2", "Receipt 3"…
 */
export function suggestDocName(kind: ItemDocKind, existing: ItemDoc[]): string {
  const label = docKindLabel(kind);
  const n = existing.filter((d) => d.kind === kind).length;
  return n === 0 ? label : `${label} ${n + 1}`;
}
