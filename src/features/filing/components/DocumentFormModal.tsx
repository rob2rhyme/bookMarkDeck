"use client";

// Filing a paper. Title + folder is the whole required path — everything else is
// optional and collapsed, because every product in this category dies of entry
// friction (ANALYSIS-FILING-LOG.md §12).

import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { Input, Select } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { DOC_TYPES, type DocType, type FilingDocument, type FilingFolder,
         type FilingParty } from "@/features/filing/lib/types";

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

const EMPTY: DocumentDraft = {
  title: "",
  folderId: null,
  partyId: null,
  docType: "",
  docDate: "",
  reference: "",
  aliases: "",
  note: "",
};

export function DocumentFormModal({
  open,
  onClose,
  onSubmit,
  editing,
  folders,
  parties,
  defaultFolderId,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: DocumentDraft) => void;
  editing?: FilingDocument | null;
  folders: FilingFolder[];
  parties: FilingParty[];
  defaultFolderId?: string | null;
}) {
  const [draft, setDraft] = useState<DocumentDraft>(EMPTY);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowMore(false);
    setDraft(
      editing
        ? {
            title: editing.title,
            folderId: editing.folderId,
            partyId: editing.partyId ?? null,
            docType: editing.docType ?? "",
            docDate: editing.docDate ?? "",
            reference: editing.reference ?? "",
            aliases: editing.aliases.join(", "),
            note: editing.note ?? "",
          }
        : { ...EMPTY, folderId: defaultFolderId ?? null }
    );
  }, [open, editing, defaultFolderId]);

  const set = <K extends keyof DocumentDraft>(k: K, v: DocumentDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    onSubmit(draft);
    onClose();
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
                  placeholder="Policy no."
                  aria-label="Reference"
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
                placeholder="Signed original, do not fold"
                aria-label="Note"
                className="mt-1"
              />
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
            disabled={!draft.title.trim()}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {editing ? "Save" : "File it"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
