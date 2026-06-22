"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { type AiHabit, aiCreateHabit } from "@/features/habits/lib/coach";

type AiCreateModalProps = {
  open: boolean;
  onClose: () => void;
  existingNames: string[];
  onResult: (ai: AiHabit) => void;
};

export function AiCreateModal({
  open,
  onClose,
  existingNames,
  onResult,
}: AiCreateModalProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const submit = async () => {
    const t = text.trim();
    if (!t || loading) return;
    setLoading(true);
    setError(null);
    const ai = await aiCreateHabit(t, existingNames);
    setLoading(false);
    if (!ai) {
      setError(
        "AI suggestions are unavailable right now. (The server needs an ANTHROPIC_API_KEY.) You can still add a habit manually."
      );
      return;
    }
    onResult(ai);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="ai-create-title"
      panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="ai-create-title" className="text-lg font-semibold tracking-tight text-slate-50">
        ✨ Describe a habit
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        Say what you want in plain words — we&apos;ll draft a habit you can tweak
        before saving.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoFocus
        placeholder="e.g. I want to read more before bed"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        className="mt-3 w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
      />
      {error && <p className="mt-2 text-[12px] text-amber-300">{error}</p>}
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || loading}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Drafting…" : "Draft it"}
        </button>
      </div>
    </Modal>
  );
}

export default AiCreateModal;
