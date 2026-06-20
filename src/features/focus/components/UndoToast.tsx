"use client";

import { X } from "@/components/icons";
import type { UndoState } from "@/features/focus/hooks/useUndo";

type UndoToastProps = {
  state: UndoState;
  onUndo: () => void;
  onDismiss: () => void;
};

/** Fixed bottom-center "deleted — Undo" toast, shown while `state` is set. */
export function UndoToast({ state, onUndo, onDismiss }: UndoToastProps) {
  if (!state) return null;
  return (
    <div className="fixed inset-x-0 bottom-5 z-[55] flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border border-slate-700 bg-slate-900/95 px-4 py-2.5 shadow-xl backdrop-blur">
        <span className="truncate text-sm text-slate-200">{state.message}</span>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 text-sm font-semibold text-blue-300 transition hover:text-blue-200"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 text-slate-500 transition hover:text-slate-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default UndoToast;
