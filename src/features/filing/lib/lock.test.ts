import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PBKDF2_ITERATIONS, createVault, vaultIterationLimits } from "@/lib/vault/vault";
import { EMPTY_DRAFT, type DocumentDraft } from "@/features/filing/lib/documentDraft";
import { isLocked, openPaper, planWrite, sealPaper, withLockInvariant, type FormMeta } from "@/features/filing/lib/lock";
import type { FilingDocument } from "@/features/filing/lib/types";

beforeAll(() => {
  vaultIterationLimits.min = 1_000;
});
afterAll(() => {
  vaultIterationLimits.min = PBKDF2_ITERATIONS;
});

const doc = (extra: Partial<FilingDocument> = {}): FilingDocument => ({
  id: "p1",
  title: "Car insurance",
  folderId: null,
  aliases: [],
  tags: [],
  obligations: [],
  createdAt: null,
  updatedAt: null,
  ...extra,
});

describe("sealing a paper", () => {
  it("round-trips reference and note, and the ciphertext shows neither", async () => {
    const { record, key } = await createVault("pw-pw-pw-pw", { iterations: 1_000 });
    const sealed = await sealPaper(key, record.id, "p1", { reference: "POL-4829104772", note: "call Dana" });
    expect(sealed.kid).toBe(record.id);
    expect(JSON.stringify(sealed)).not.toContain("POL");
    expect(JSON.stringify(sealed)).not.toContain("Dana");
    expect(await openPaper(key, "p1", sealed)).toEqual({ reference: "POL-4829104772", note: "call Dana" });
  });

  it("is bound to the paper: one paper's seal does not open as another's", async () => {
    const { record, key } = await createVault("pw-pw-pw-pw", { iterations: 1_000 });
    const sealed = await sealPaper(key, record.id, "p1", { reference: "x", note: "" });
    await expect(openPaper(key, "p2", sealed)).rejects.toThrow();
  });

  it("reads a missing field as empty rather than failing", async () => {
    const { record, key } = await createVault("pw-pw-pw-pw", { iterations: 1_000 });
    const { sealText } = await import("@/lib/vault/vault");
    const sealed = await sealText(key, record.id, "filing", "p1", '{"reference":7}');
    expect(await openPaper(key, "p1", sealed)).toEqual({ reference: "", note: "" });
  });
});

describe("withLockInvariant", () => {
  const lock = { kid: "v", iv: "i", ct: "c" };

  it("strips plaintext from a locked paper and marks it confidential", () => {
    const out = withLockInvariant(doc({ lock, reference: "POL-1", note: "secret" }));
    expect(out.reference).toBeUndefined();
    expect(out.note).toBeUndefined();
    expect(out.confidential).toBe(true);
    expect(out.lock).toEqual(lock);
  });

  it("clears a stale confidential flag on an unlocked paper and leaves its text", () => {
    const out = withLockInvariant(doc({ confidential: true, reference: "POL-1" }));
    expect(out.confidential).toBe(false);
    expect(out.reference).toBe("POL-1");
  });

  it("leaves an ordinary paper untouched", () => {
    const d = doc({ reference: "POL-1", note: "n" });
    expect(withLockInvariant(d)).toBe(d);
  });

  it("does not judge a partial record: its missing fields are missing, not empty", () => {
    const d = doc({ partial: true, confidential: true });
    expect(withLockInvariant(d)).toBe(d);
  });

  it("isLocked follows the lock", () => {
    expect(isLocked(doc({ lock }))).toBe(true);
    expect(isLocked(doc({ confidential: true }))).toBe(false);
  });
});

describe("planWrite", () => {
  const seed: DocumentDraft = { ...EMPTY_DRAFT, title: "Car insurance", reference: "POL-1", note: "n1" };
  const meta = (m: Partial<FormMeta> = {}): FormMeta => ({ seed, wantLock: false, secretsOpen: false, ...m });
  const lock = { kid: "v", iv: "i", ct: "c" };

  it("a new paper: every field, secrets plain — or sealed when locked", () => {
    const draft = { ...seed, aliases: "pink slip" };
    const plain = planWrite({ editing: null, draft, meta: meta({ seed: EMPTY_DRAFT }) });
    expect(plain.fields).toEqual(["title", "folderId", "partyId", "docType", "docDate", "aliases"]);
    expect(plain.secret).toMatchObject({ mode: "plain", unlock: false, fields: ["reference", "note"] });

    const locked = planWrite({ editing: null, draft, meta: meta({ seed: EMPTY_DRAFT, wantLock: true }) });
    expect(locked.secret).toEqual({ mode: "seal", secrets: { reference: "POL-1", note: "n1" } });
  });

  it("an unlocked paper edited: only what changed; secrets untouched when neither changed", () => {
    const same = planWrite({ editing: doc(), draft: { ...seed, title: "Auto insurance" }, meta: meta() });
    expect(same.fields).toEqual(["title"]);
    expect(same.secret).toEqual({ mode: "none" });

    const note = planWrite({ editing: doc(), draft: { ...seed, note: "n2" }, meta: meta() });
    expect(note.secret).toMatchObject({ mode: "plain", fields: ["note"], unlock: false });
  });

  it("locking an existing paper seals its secrets even when the user typed nothing new", () => {
    const p = planWrite({ editing: doc(), draft: seed, meta: meta({ wantLock: true }) });
    expect(p.secret).toEqual({ mode: "seal", secrets: { reference: "POL-1", note: "n1" } });
    expect(p.fields).toEqual([]);
  });

  it("a locked paper with the vault closed: only non-secret fields, never the lock", () => {
    const p = planWrite({
      editing: doc({ lock }),
      draft: { ...seed, reference: "", note: "", title: "Renamed" },
      meta: meta({ seed: { ...seed, reference: "", note: "" }, wantLock: true, secretsOpen: false }),
    });
    expect(p.fields).toEqual(["title"]);
    expect(p.secret).toEqual({ mode: "none" });
  });

  it("a locked paper opened: unchanged secrets are not re-sealed, changed ones are", () => {
    const open = (draft: DocumentDraft) =>
      planWrite({ editing: doc({ lock }), draft, meta: meta({ wantLock: true, secretsOpen: true }) });
    expect(open(seed).secret).toEqual({ mode: "none" });
    expect(open({ ...seed, reference: "POL-2" }).secret).toEqual({
      mode: "seal",
      secrets: { reference: "POL-2", note: "n1" },
    });
  });

  it("taking the lock off writes both fields back as plain text and removes the lock", () => {
    const p = planWrite({ editing: doc({ lock }), draft: seed, meta: meta({ wantLock: false, secretsOpen: true }) });
    expect(p.secret).toEqual({
      mode: "plain",
      secrets: { reference: "POL-1", note: "n1" },
      fields: ["reference", "note"],
      unlock: true,
    });
  });

  it("cannot take a lock off while the secrets are unreadable", () => {
    const p = planWrite({ editing: doc({ lock }), draft: seed, meta: meta({ wantLock: false, secretsOpen: false }) });
    expect(p.secret).toEqual({ mode: "none" });
  });
});
