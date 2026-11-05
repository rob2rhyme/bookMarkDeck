"use client";

// Filing a paper. Title + folder is the whole required path — everything else is
// optional and collapsed, because every product in this category dies of entry
// friction (ANALYSIS-FILING-LOG.md §12).

import { useEffect, useId, useState } from "react";

import { CredentialNotice } from "@/components/CredentialNotice";
import { Modal } from "@/components/Modal";
import { Input, Select } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { firstCredential } from "@/lib/credentialGuard";
import { keyFor, useVaultUnlocked } from "@/lib/vault/vaultSession";
import { draftFor, EMPTY_DRAFT, type DocumentDraft } from "@/features/filing/lib/documentDraft";
import { openPaper, type FormMeta } from "@/features/filing/lib/lock";
import { DOC_TYPES, type DocType, type FilingDocument, type FilingFolder,
         type FilingParty } from "@/features/filing/lib/types";

export type { DocumentDraft };

export function DocumentFormModal({
  open,
  onClose,
  onSubmit,
  editing,
  folders,
  parties,
  defaultFolderId,
  vaultReady,
  ensureVault,
}: {
  open: boolean;
  onClose: () => void;
  /** Resolve `false` to keep the form open (a lock that could not be made, say). */
  onSubmit: (draft: DocumentDraft, meta: FormMeta) => Promise<boolean | void> | boolean | void;
  editing?: FilingDocument | null;
  folders: FilingFolder[];
  parties: FilingParty[];
  defaultFolderId?: string | null;
  /** The vault records have loaded (so setting one up is safe). */
  vaultReady: boolean;
  /** Set up or unlock the vault in the shared dialog; true once one is open. */
  ensureVault: () => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<DocumentDraft>(EMPTY_DRAFT);
  // What the form started from. For a locked paper that is the DECRYPTED reference
  // and note once they could be read, so "changed" means changed by the user.
  const [seed, setSeed] = useState<DocumentDraft>(EMPTY_DRAFT);
  const [showMore, setShowMore] = useState(false);
  const [wantLock, setWantLock] = useState(false);
  const [secretsLoaded, setSecretsLoaded] = useState(false);
  const [lockNote, setLockNote] = useState<string | null>(null);
  const lockId = useId();
  const lockHintId = useId();

  useEffect(() => {
    if (!open) return;
    const start = editing ? draftFor(editing) : { ...EMPTY_DRAFT, folderId: defaultFolderId ?? null };
    setShowMore(false);
    setDraft(start);
    setSeed(start);
    setWantLock(Boolean(editing?.lock));
    setSecretsLoaded(false);
    setLockNote(null);
  }, [open, editing, defaultFolderId]);

  // A locked paper's reference and note exist, readable, only while the vault is open.
  const sealed = editing?.lock ?? null;
  const unlocked = useVaultUnlocked();
  const key = sealed && unlocked ? keyFor(sealed.kid) : undefined;
  useEffect(() => {
    if (!open || !editing || !sealed || !key) return;
    let cancelled = false;
    openPaper(key, editing.id, sealed).then(
      (s) => {
        if (cancelled) return;
        setSeed((d) => ({ ...d, reference: s.reference, note: s.note }));
        setDraft((d) => ({ ...d, reference: s.reference, note: s.note }));
        setSecretsLoaded(true);
      },
      () => {
        if (!cancelled) setLockNote("This paper couldn\u2019t be decrypted. Its sealed text may be damaged.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [open, editing, sealed, key]);

  // Readable only while loaded AND the vault is still open: if it locks again (idle
  // timeout) the fields go back to locked and an unsaved edit to them is not written.
  const secretsOpen = secretsLoaded && Boolean(key);
  const lockedClosed = Boolean(sealed) && !secretsOpen;

  const set = <K extends keyof DocumentDraft>(k: K, v: DocumentDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  // Judged against the seed, not the stored record: a locked paper's stored fields are
  // empty, so its decrypted text would otherwise read as something the user just typed.
  const refused = firstCredential([
    { value: draft.reference, was: seed.reference },
    { value: draft.note, was: seed.note },
  ]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim() || refused) return;
    const ok = await onSubmit(draft, { seed, wantLock, secretsOpen });
    if (ok !== false) onClose();
  }

  async function toggleLock(next: boolean) {
    setLockNote(null);
    if (!next) return setWantLock(false);
    if (!vaultReady) return setLockNote("Still loading your lock settings \u2014 try again in a moment.");
    if (await ensureVault()) setWantLock(true);
  }

  async function unlockToEdit() {
    setLockNote(null);
    if (!vaultReady) return setLockNote("Still loading your lock settings \u2014 try again in a moment.");
    await ensureVault();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="filing-document-title"
      panelClassName="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="filing-document-title" className="text-lg font-semibold tracking-tight text-slate-50">
          {editing ? "Edit paper" : "File a paper"}
        </h2>
        <p className="text-[12px] text-slate-500">A title is enough</p>
      </div>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <div>
          <SectionLabel>What is it</SectionLabel>
          <Input
            autoFocus
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Certificate of title"
            aria-label="Title"
            className="mt-1"
          />
        </div>

        <div>
          <SectionLabel>Which folder</SectionLabel>
          <Select
            value={draft.folderId ?? ""}
            onChange={(e) => set("folderId", e.target.value || null)}
            aria-label="Folder"
            className="mt-1"
          >
            <option value="">Unfiled — sort it later</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </div>

        {!showMore ? (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="self-start text-sm font-medium text-blue-400 transition hover:text-blue-300"
          >
            ▸ Add details — type, date, reference, aliases…
          </button>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <SectionLabel>Type</SectionLabel>
                <Select
                  value={draft.docType}
                  onChange={(e) => set("docType", e.target.value as DocType | "")}
                  aria-label="Document type"
                  className="mt-1"
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t.id || "none"} value={t.id}>
                      {t.icon} {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <SectionLabel>Date on the paper</SectionLabel>
                <Input
                  type="date"
                  value={draft.docDate}
                  onChange={(e) => set("docDate", e.target.value)}
                  aria-label="Document date"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <SectionLabel>Whose</SectionLabel>
                <Select
                  value={draft.partyId ?? ""}
                  onChange={(e) => set("partyId", e.target.value || null)}
                  aria-label="Party"
                  className="mt-1"
                >
                  <option value="">Same as the folder</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <SectionLabel>Reference</SectionLabel>
                <Input
                  value={draft.reference}
                  onChange={(e) => set("reference", e.target.value)}
                  placeholder={lockedClosed ? "\u{1F512} Locked" : "Policy no."}
                  aria-label="Reference"
                  disabled={lockedClosed}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <SectionLabel>Also call it</SectionLabel>
              <Input
                value={draft.aliases}
                onChange={(e) => set("aliases", e.target.value)}
                placeholder="pink slip, title"
                aria-label="Aliases, comma separated"
                className="mt-1"
              />
            </div>

            <div>
              <SectionLabel>Note</SectionLabel>
              <Input
                value={draft.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder={lockedClosed ? "\u{1F512} Locked" : "Signed original, do not fold"}
                aria-label="Note"
                disabled={lockedClosed}
                className="mt-1"
              />
            </div>
            <CredentialNotice kind={refused} />

            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              {lockedClosed ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] text-slate-300">
                    <span aria-hidden>{"\u{1F512} "}</span>
                    Reference and note are locked.
                  </p>
                  <button
                    type="button"
                    onClick={unlockToEdit}
                    className="shrink-0 rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-blue-400"
                  >
                    Unlock to view or edit
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-[13px] text-slate-300">
                  <input
                    id={lockId}
                    type="checkbox"
                    checked={wantLock}
                    onChange={(e) => void toggleLock(e.target.checked)}
                    aria-describedby={lockHintId}
                    className="mt-0.5 accent-blue-500"
                  />
                  <div>
                    <label htmlFor={lockId}>Lock reference and note</label>
                    <p id={lockHintId} className="mt-0.5 text-[12px] text-slate-500">
                      Encrypted on this device before they are saved &mdash; nobody else can read them, including
                      whoever stores your data. Title, dates, folder and tags stay visible so you can still find the
                      paper. Scans are not encrypted. Lose your passphrase and recovery code and they cannot be
                      recovered.
                    </p>
                  </div>
                </div>
              )}
              {lockNote && (
                <p role="alert" className="mt-2 text-[12px] text-amber-300">
                  {lockNote}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!draft.title.trim() || refused !== null}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {editing ? "Save" : "File it"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
