"use client";

import { useEffect, useState } from "react";

import type { FocusMode } from "@/features/focus/hooks/useFocusTimer";
import type { FocusSettings } from "@/features/focus/lib/settings";
import { initAudio, playChime } from "@/features/focus/lib/sound";

type TimeUpModalProps = {
  /** The mode that just finished, or null when nothing is pending. */
  completedMode: FocusMode | null;
  settings: FocusSettings;
  /** Save a reflection note onto the focus block that just finished. */
  onReflect?: (text: string) => void;
  onClose: () => void;
};

const MAX_CHIMES = 5; // repeat the alert tone this many times, then stop
const CHIME_GAP_MS = 3000;

export function TimeUpModal({
  completedMode,
  settings,
  onReflect,
  onClose,
}: TimeUpModalProps) {
  const open = completedMode !== null;
  const isFocusEnd = completedMode === "focus";
  const [reflection, setReflection] = useState("");

  useEffect(() => {
    if (!open) setReflection("");
  }, [open]);

  const close = () => {
    const text = reflection.trim();
    if (isFocusEnd && text && onReflect) onReflect(text);
    onClose();
  };

  // Repeat a loud chime + vibrate while open so it's hard to miss, even if the
  // tab was backgrounded when the timer fired and the user just came back.
  useEffect(() => {
    if (!open) return;

    const fire = () => {
      if (settings.soundEnabled) {
        initAudio();
        playChime(isFocusEnd ? "session" : "break", settings.chimeSound);
      }
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {}
    };

    fire();
    let count = 1;
    const id = setInterval(() => {
      if (count >= MAX_CHIMES) {
        clearInterval(id);
        return;
      }
      count += 1;
      fire();
    }, CHIME_GAP_MS);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      clearInterval(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, isFocusEnd, settings.soundEnabled, settings.chimeSound, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={close}
      className="animate-bd-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-label="Timer finished"
        className={`animate-bd-scale-in w-full max-w-sm rounded-3xl border p-8 text-center shadow-2xl ${
          isFocusEnd
            ? "border-blue-500/50 bg-slate-900"
            : "border-emerald-500/50 bg-slate-900"
        }`}
      >
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
            isFocusEnd
              ? "bg-blue-500/15 text-blue-300"
              : "bg-emerald-500/15 text-emerald-300"
          }`}
          aria-hidden="true"
        >
          {isFocusEnd ? "🎉" : "⏳"}
        </div>

        <h2 className="mt-5 text-2xl font-semibold text-slate-50">
          {isFocusEnd ? "Focus session complete!" : "Break’s over"}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          {isFocusEnd
            ? "Nice work. Time to step away for a break."
            : "Ready to get back to it?"}
        </p>

        {isFocusEnd && onReflect && (
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="How did it go? (optional reflection)"
            aria-label="Session reflection"
            rows={2}
            className="mt-5 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-left text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-400"
          />
        )}

        <button
          type="button"
          onClick={close}
          autoFocus
          className={`mt-6 w-full rounded-full px-6 py-3 text-sm font-semibold text-white shadow-sm transition ${
            isFocusEnd
              ? "bg-blue-600 hover:bg-blue-500"
              : "bg-emerald-600 hover:bg-emerald-500"
          }`}
        >
          {isFocusEnd && reflection.trim() ? "Save & dismiss" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}

export default TimeUpModal;
