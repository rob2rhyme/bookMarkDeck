"use client";

import { Modal } from "@/components/Modal";

/**
 * A themed yes/no for an action that can't be taken back. Replaces
 * `window.confirm`, which ignores the theme, can't be styled or tested in the page,
 * and is blocked outright by some embedded browsers. Focus starts on the first
 * button (Cancel), so Enter never confirms by accident.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      labelledBy="confirm-dialog-title"
      panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="confirm-dialog-title" className="text-base font-semibold tracking-tight text-slate-50">
        {title}
      </h2>
      <p className="mt-2 text-[13px] text-slate-400">{body}</p>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
