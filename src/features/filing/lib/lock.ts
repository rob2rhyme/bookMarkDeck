// Locking a paper: its `reference` and `note` are sealed with the account's vault
// (src/lib/vault — the same passphrase that locks Notes) and kept, as one small
// blob, in `FilingDocument.lock`. Pure apart from WebCrypto; no React, no Firestore.
//
// What is sealed is chosen by what a paper's secrets actually are: a policy, account
// or case number and a free-text note. What is NOT sealed is what lists, search,
// reminders, the nav badge and the shred queue run on — title, dates, folder, tags,
// aliases, obligations — which is also why the form says so before it locks anything.

import { openText, sealText, type SealedText } from "@/lib/vault/vault";
import type { DocumentDraft } from "@/features/filing/lib/documentDraft";
import type { FilingDocument } from "@/features/filing/lib/types";

/** Part of every ciphertext's additional data; changing it strands every locked paper. */
export const FILING_CONTEXT = "filing";

export type PaperSecrets = { reference: string; note: string };

export const isLocked = (d: Pick<FilingDocument, "lock">): boolean => Boolean(d.lock);

export function sealPaper(key: CryptoKey, kid: string, paperId: string, secrets: PaperSecrets): Promise<SealedText> {
  return sealText(
    key,
    kid,
    FILING_CONTEXT,
    paperId,
    JSON.stringify({ reference: secrets.reference, note: secrets.note })
  );
}

export async function openPaper(key: CryptoKey, paperId: string, sealed: SealedText): Promise<PaperSecrets> {
  const parsed: unknown = JSON.parse(await openText(key, FILING_CONTEXT, paperId, sealed));
  const o = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  return {
    reference: typeof o.reference === "string" ? o.reference : "",
    note: typeof o.note === "string" ? o.note : "",
  };
}

/**
 * The invariant, applied wherever a document is built or read: a locked paper has no
 * plaintext `reference` or `note`, and `confidential` says so. A caller that hands over
 * both loses the plaintext, never the lock — the safe direction to be wrong in.
 */
export function withLockInvariant<T extends FilingDocument>(d: T): T {
  // A partial record is rebuilt from the slim cache, which keeps the flag but not the
  // sealed blob: its missing fields are missing, not empty, so there is nothing to judge.
  if (d.partial) return d;
  if (!d.lock) return d.confidential ? { ...d, confidential: false } : d;
  return { ...d, reference: undefined, note: undefined, confidential: true };
}

/* ------------------------------------------------------------ the write --- */

export type FormMeta = {
  /** The form's starting values — for a locked paper, the DECRYPTED ones once they were readable. */
  seed: DocumentDraft;
  /** Does the user want this paper locked when it is saved? */
  wantLock: boolean;
  /** Were a locked paper's secrets readable (vault open) when the form was filled in? */
  secretsOpen: boolean;
};

export type SecretWrite =
  /** Leave the paper's secrets exactly as stored. */
  | { mode: "none" }
  /** Seal these and store them in `lock`; clear the plaintext fields. */
  | { mode: "seal"; secrets: PaperSecrets }
  /** Store these fields as plain text; `unlock` also removes an existing lock (then both are written). */
  | { mode: "plain"; secrets: PaperSecrets; fields: SecretField[]; unlock: boolean };

export type SecretField = "reference" | "note";

/**
 * Decide what a form submit writes. `fields` are the non-secret fields the user
 * changed; `secret` says what happens to reference + note. Kept pure so every
 * combination of new/edit, plain/locked and vault open/closed is pinned in a test.
 */
export function planWrite(input: {
  editing: Pick<FilingDocument, "lock"> | null;
  draft: DocumentDraft;
  meta: FormMeta;
}): { fields: Exclude<keyof DocumentDraft, SecretField>[]; secret: SecretWrite } {
  const { editing, draft, meta } = input;
  const { seed, wantLock, secretsOpen } = meta;
  const secrets: PaperSecrets = { reference: draft.reference.trim(), note: draft.note.trim() };

  const fields = (Object.keys(draft) as (keyof DocumentDraft)[]).filter(
    (k): k is Exclude<keyof DocumentDraft, SecretField> =>
      k !== "reference" && k !== "note" && (editing === null || draft[k] !== seed[k])
  );
  const changedSecrets = (["reference", "note"] as const).filter((k) => draft[k] !== seed[k]);
  const secretsChanged = changedSecrets.length > 0;
  const BOTH: SecretField[] = ["reference", "note"];

  if (editing?.lock) {
    // Closed vault: the secrets were never readable, so nothing here can have changed them.
    if (!secretsOpen) return { fields, secret: { mode: "none" } };
    if (!wantLock) return { fields, secret: { mode: "plain", secrets, fields: BOTH, unlock: true } };
    return { fields, secret: secretsChanged ? { mode: "seal", secrets } : { mode: "none" } };
  }

  if (wantLock) return { fields, secret: { mode: "seal", secrets } };
  if (editing === null) return { fields, secret: { mode: "plain", secrets, fields: BOTH, unlock: false } };
  return {
    fields,
    secret: secretsChanged ? { mode: "plain", secrets, fields: changedSecrets, unlock: false } : { mode: "none" },
  };
}
