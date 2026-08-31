"use client";

// Scans attached to a paper.
//
// The pillar's stated position is index-first: this is about FINDING paper, not
// replacing it. So an attachment is an optional extra on a record that already
// works without one, never a requirement — and the whole surface hides itself
// when object storage isn't configured, rather than offering a button that
// can't work.

import { useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { Trash } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ACCEPT_ATTR,
  FAILURE_MESSAGES,
  formatBytes,
  isImage,
  uploadAttachment,
  type UploadFailure,
} from "@/features/filing/lib/attachments";
import type { FilingAttachment, FilingDocument } from "@/features/filing/lib/types";

export function AttachmentsModal({
  open,
  onClose,
  document: paper,
  attachments,
  loading,
  connected,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  document: FilingDocument | null;
  attachments: FilingAttachment[];
  loading: boolean;
  connected: boolean;
  onAdd: (a: FilingAttachment) => void;
  onRemove: (a: FilingAttachment) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!paper) return null;

  async function pick(files: FileList | null) {
    if (!files?.length || !paper) return;
    setError(null);
    setBusy(true);
    for (const file of Array.from(files)) {
      const out = await uploadAttachment(file, paper.id);
      if (!out.ok) {
        setError(
          out.reason === "too_large"
            ? `${file.name} is too large (${formatBytes(file.size)}).`
            : FAILURE_MESSAGES[out.reason as UploadFailure]
        );
        continue;
      }
      onAdd({
        id: crypto.randomUUID(),
        documentId: paper.id,
        name: file.name.slice(0, 120),
        contentType: file.type,
        size: file.size,
        path: out.result.path,
        url: out.result.url,
        addedAt: new Date().toISOString(),
      });
    }
    setBusy(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="filing-attachments-title"
      panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="filing-attachments-title" className="text-lg font-semibold tracking-tight text-slate-50">
        Scans
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        {paper.title} — a copy for when you can&rsquo;t get to the paper itself.
      </p>

      {!connected ? (
        <p className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-300/90">
          Scans are stored in your account, so this needs sync turned on. The
          paper&rsquo;s own record works fine without one.
        </p>
      ) : (
        <>
          {loading ? (
            <p className="mt-5 text-[13px] text-slate-500">Loading…</p>
          ) : attachments.length === 0 ? (
            <EmptyState className="mt-5">
              No scan attached. Filing is about finding the paper — a scan is
              just a convenience for when you can&rsquo;t.
            </EmptyState>
          ) : (
            <ul className="mt-5 flex flex-col gap-1">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
                >
                  <span aria-hidden className="shrink-0">
                    {isImage(a.contentType) ? "🖼️" : "📄"}
                  </span>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1"
                  >
                    <span className="block truncate text-sm text-slate-200">{a.name}</span>
                    <span className="block text-[11px] text-slate-500">
                      {formatBytes(a.size)}
                      {a.addedAt ? ` · ${a.addedAt.slice(0, 10)}` : ""}
                    </span>
                  </a>
                  <button
                    type="button"
                    onClick={() => onRemove(a)}
                    aria-label={`Remove ${a.name}`}
                    className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-red-500/15 hover:text-red-300"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = e.target.files;
              e.target.value = ""; // let the same file be picked twice
              void pick(files);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="mt-4 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Add a scan"}
          </button>
          <p className="mt-2 text-[12px] text-slate-500">
            PDFs and photos, up to 20 MB each.
          </p>

          {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
      >
        Done
      </button>
    </Modal>
  );
}
