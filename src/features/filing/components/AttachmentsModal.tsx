"use client";

// Scans attached to a paper.
//
// The pillar's stated position is index-first: this is about FINDING paper, not
// replacing it. So an attachment is an optional extra on a record that already
// works without one, never a requirement — and the whole surface hides itself
// when object storage isn't configured, rather than offering a button that
// can't work.
//
// A scan is ENCRYPTED on this device before it is uploaded (default; one tick to turn it
// off), with the same vault that locks Notes and a paper's reference and note. Nothing
// is read from a public address: opening a scan asks the server for a two-minute signed
// URL, fetches the (cipher)text, and — for a sealed one — decrypts it here. Images are
// previewed in place; a PDF is offered as a download, because the CSP forbids embedding
// one (`object-src 'none'`) and that is not worth loosening for a preview.

import { useEffect, useId, useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { Trash } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ACCEPT_ATTR,
  FAILURE_MESSAGES,
  READ_FAILURE_MESSAGES,
  fetchStored,
  formatBytes,
  isImage,
  readUrl,
  uploadAttachment,
  type UploadFailure,
} from "@/features/filing/lib/attachments";
import { LOCKED_SCAN_NAME, openScan, openScanName, sealScan } from "@/features/filing/lib/scanCrypto";
import type { FilingAttachment, FilingDocument } from "@/features/filing/lib/types";
import { dayKeyOf } from "@/lib/dayKey";
import { isUnlocked, keyFor, subscribe, useVaultUnlocked } from "@/lib/vault/vaultSession";

/** " · 2026-09-30" — the LOCAL day it was added (addedAt is an instant). */
function addedLabel(addedAt?: string | null): string {
  const day = addedAt ? dayKeyOf(addedAt) : null;
  return day ? ` · ${day}` : "";
}

/** What a browser can draw inline; everything else (a PDF, a HEIC) is a download. */
const INLINE_IMAGES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Viewing = { id: string; url: string; name: string; contentType: string };

/** The decrypted scan, held as a blob URL that is revoked the moment it is not shown. */
function ScanPreview({ viewing, onClose }: { viewing: Viewing; onClose: () => void }) {
  useEffect(() => {
    const url = viewing.url;
    return () => URL.revokeObjectURL(url);
  }, [viewing.url]);

  return (
    <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-3" role="region" aria-label={`Preview of ${viewing.name}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-slate-200">{viewing.name}</p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
        >
          Close preview
        </button>
      </div>
      {INLINE_IMAGES.has(viewing.contentType) && (
        // eslint-disable-next-line @next/next/no-img-element -- a blob: URL of the decrypted scan
        <img src={viewing.url} alt={viewing.name} className="mt-3 max-h-80 w-full rounded-lg object-contain" />
      )}
      <a
        href={viewing.url}
        download={viewing.name}
        className="mt-3 inline-block rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
      >
        Download {viewing.name}
      </a>
      <p className="mt-2 text-[11px] text-slate-500">Decrypted on this device; it is not saved anywhere unencrypted.</p>
    </div>
  );
}

export function AttachmentsModal({
  open,
  onClose,
  document: paper,
  attachments,
  loading,
  connected,
  onAdd,
  onReplace,
  onRemove,
  vaultReady,
  ensureVault,
  primaryKid,
}: {
  open: boolean;
  onClose: () => void;
  document: FilingDocument | null;
  attachments: FilingAttachment[];
  loading: boolean;
  connected: boolean;
  onAdd: (a: FilingAttachment) => void;
  /** A scan swapped for a newly sealed version of itself; `oldPath` is the object to delete. */
  onReplace: (next: FilingAttachment, oldPath: string) => void;
  onRemove: (a: FilingAttachment) => void;
  /** The vault records have loaded (so setting one up is safe). */
  vaultReady: boolean;
  /** Set up or unlock the vault in the shared dialog; true once one is open. */
  ensureVault: () => Promise<boolean>;
  /** The vault a NEW seal should use — the oldest open one — or null. */
  primaryKid: () => string | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const encryptId = useId();
  const encryptHintId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encrypt, setEncrypt] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const unlocked = useVaultUnlocked();

  // Decrypted names and the open preview exist only while the vault is open: when it
  // locks (idle timeout, "Lock now"), they go. Dropped from a subscription callback,
  // not an effect body.
  useEffect(
    () =>
      subscribe(() => {
        if (isUnlocked()) return;
        setNames({});
        setViewing(null);
      }),
    []
  );

  // Open the sealed file names of the scans listed, while there is a key for them.
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    for (const a of attachments) {
      const key = a.enc ? keyFor(a.enc.kid) : undefined;
      if (!a.enc || !key) continue;
      void openScanName(key, a).then((name) => {
        if (!cancelled && name) setNames((prev) => (prev[a.id] === name ? prev : { ...prev, [a.id]: name }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [attachments, unlocked]);

  if (!paper) return null;

  const shownName = (a: FilingAttachment): string => {
    if (!a.enc) return a.name;
    return (unlocked && keyFor(a.enc.kid) ? names[a.id] : undefined) ?? LOCKED_SCAN_NAME;
  };

  /** A key to seal NEW scans with — asking for the vault if it is closed. */
  async function sealingKey(): Promise<{ kid: string; key: CryptoKey } | null> {
    if (!vaultReady) {
      setError("Still loading your lock settings — try again in a moment.");
      return null;
    }
    await ensureVault();
    const kid = primaryKid();
    const key = kid ? keyFor(kid) : undefined;
    if (!kid || !key) {
      setError("Encrypting a scan needs your vault. Unlock it, or untick “Encrypt” to add the scan as it is.");
      return null;
    }
    return { kid, key };
  }

  async function pick(files: FileList | null) {
    if (!files?.length || !paper) return;
    setError(null);
    setBusy(true);
    try {
      const sealing = encrypt ? await sealingKey() : null;
      if (encrypt && !sealing) return;
      for (const file of Array.from(files)) {
        const id = crypto.randomUUID();
        let out;
        let enc: FilingAttachment["enc"] = null;
        if (sealing) {
          try {
            const sealed = await sealScan({ file, key: sealing.key, kid: sealing.kid, attachmentId: id });
            enc = sealed.enc;
            out = await uploadAttachment({
              body: sealed.blob,
              contentType: file.type,
              documentId: paper.id,
              encrypted: true,
            });
          } catch {
            setError(`Couldn’t encrypt ${file.name}. Nothing was uploaded.`);
            continue;
          }
        } else {
          out = await uploadAttachment({ body: file, contentType: file.type, documentId: paper.id });
        }
        if (!out.ok) {
          setError(
            out.reason === "too_large"
              ? `${file.name} is too large (${formatBytes(file.size)}).`
              : FAILURE_MESSAGES[out.reason as UploadFailure]
          );
          continue;
        }
        onAdd({
          id,
          documentId: paper.id,
          // A sealed scan's pointer carries a stand-in; the real name is sealed in `enc`.
          name: enc ? LOCKED_SCAN_NAME : file.name.slice(0, 120),
          contentType: file.type,
          size: file.size,
          path: out.result.path,
          enc,
          addedAt: new Date().toISOString(),
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function openScanFile(a: FilingAttachment) {
    setError(null);

    if (!a.enc) {
      // Not encrypted: hand the browser a fresh signed URL in a new tab. The tab is opened
      // first, inside the click, so a pop-up blocker allows it, then pointed at the URL.
      const tab = window.open("", "_blank");
      if (tab) tab.opener = null;
      const signed = await readUrl(a.path);
      if (!signed.ok) {
        tab?.close();
        setError(READ_FAILURE_MESSAGES[signed.reason]);
        return;
      }
      if (!tab) {
        setError("Your browser blocked the new tab — allow pop-ups for this site and try again.");
        return;
      }
      tab.location.href = signed.url;
      return;
    }

    let key = keyFor(a.enc.kid);
    if (!key) {
      if (!vaultReady) {
        setError("Still loading your lock settings — try again in a moment.");
        return;
      }
      await ensureVault();
      key = keyFor(a.enc.kid);
      if (!key) {
        setError("That scan is locked with a passphrase that isn’t open. Unlock with the one it was locked with.");
        return;
      }
    }
    setWorking(a.id);
    try {
      const got = await fetchStored(a.path);
      if (!got.ok) {
        setError(READ_FAILURE_MESSAGES[got.reason]);
        return;
      }
      try {
        const opened = await openScan({ sealed: got.bytes, key, attachment: a });
        setViewing({ id: a.id, url: URL.createObjectURL(opened.blob), name: opened.name, contentType: opened.contentType });
      } catch {
        setError("That scan couldn’t be decrypted. It may be damaged, or sealed for something else.");
      }
    } finally {
      setWorking(null);
    }
  }

  /** Encrypt a scan that was uploaded as it was: fetch it, seal it here, upload the sealed copy, swap the pointer. */
  async function encryptExisting(a: FilingAttachment) {
    setError(null);
    if (!a.contentType) {
      setError("That scan has no recorded type, so it can’t be re-uploaded.");
      return;
    }
    setWorking(a.id);
    try {
      const sealing = await sealingKey();
      if (!sealing) return;
      const got = await fetchStored(a.path);
      if (!got.ok) {
        setError(READ_FAILURE_MESSAGES[got.reason]);
        return;
      }
      const file = new File([got.bytes], a.name, { type: a.contentType });
      const sealed = await sealScan({ file, key: sealing.key, kid: sealing.kid, attachmentId: a.id });
      const out = await uploadAttachment({
        body: sealed.blob,
        contentType: a.contentType,
        documentId: a.documentId || paper!.id,
        encrypted: true,
      });
      if (!out.ok) {
        setError(FAILURE_MESSAGES[out.reason as UploadFailure]);
        return;
      }
      const { url: _legacyUrl, ...rest } = a;
      void _legacyUrl;
      onReplace({ ...rest, name: LOCKED_SCAN_NAME, path: out.result.path, enc: sealed.enc }, a.path);
    } catch {
      setError("Couldn’t encrypt that scan. It was left as it was.");
    } finally {
      setWorking(null);
    }
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
                    {a.enc ? "🔒" : isImage(a.contentType) ? "🖼️" : "📄"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void openScanFile(a)}
                    disabled={working === a.id}
                    aria-label={`Open ${shownName(a)}`}
                    className="min-w-0 flex-1 text-left disabled:opacity-60"
                  >
                    <span className="block truncate text-sm text-slate-200">{shownName(a)}</span>
                    <span className="block text-[11px] text-slate-500">
                      {formatBytes(a.size)}
                      {addedLabel(a.addedAt)}
                      {a.enc ? " · encrypted" : ""}
                    </span>
                  </button>
                  {!a.enc && (
                    <button
                      type="button"
                      onClick={() => void encryptExisting(a)}
                      disabled={working === a.id}
                      className="shrink-0 rounded-full border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300 transition hover:border-amber-400 disabled:opacity-60"
                      title="Not encrypted. Encrypt it on this device and replace the stored copy."
                    >
                      Encrypt
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(a)}
                    aria-label={`Remove ${shownName(a)}`}
                    className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-red-500/15 hover:text-red-300"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {viewing && <ScanPreview viewing={viewing} onClose={() => setViewing(null)} />}

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
          <div className="mt-4 flex items-start gap-2 text-[13px] text-slate-300">
            <input
              id={encryptId}
              type="checkbox"
              checked={encrypt}
              onChange={(e) => setEncrypt(e.target.checked)}
              aria-describedby={encryptHintId}
              className="mt-0.5 accent-blue-500"
            />
            <div>
              <label htmlFor={encryptId}>Encrypt scans I add</label>
              <p id={encryptHintId} className="mt-0.5 text-[12px] text-slate-500">
                {encrypt
                  ? "Encrypted on this device before upload, with the same passphrase as locked notes. Lose the passphrase and recovery code and the scan is gone. The file name is sealed too."
                  : "Stored as it is — readable by whoever runs the storage. A copy you can lose without losing the paper."}
              </p>
            </div>
          </div>
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

          {error && (
            <p role="alert" className="mt-2 text-[12px] text-red-400">
              {error}
            </p>
          )}
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
