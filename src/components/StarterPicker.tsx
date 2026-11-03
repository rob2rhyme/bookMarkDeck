"use client";

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { Emoji } from "@/components/icons";

export type StarterItem = { key: string; label: string; hint?: string };
export type StarterSection = { name: string; emoji?: string; items: StarterItem[] };

/**
 * "Start with a few …" — the shape of Habits' template picker, shared by the
 * empty Bookmarks library and the empty Focus task list: grouped chips to toggle,
 * then one button that adds what was picked. Picks reset on close.
 */
export function StarterPicker({
  open,
  onClose,
  onAdd,
  title,
  intro,
  noun,
  sections,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (keys: string[]) => void;
  title: string;
  intro: string;
  /** Singular and plural, for the button: ["link", "links"]. */
  noun: [string, string];
  sections: StarterSection[];
}) {
  const [picked, setPicked] = useState<string[]>([]);

  const close = () => {
    setPicked([]);
    onClose();
  };
  const toggle = (key: string) =>
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const add = () => {
    if (picked.length) onAdd(picked);
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      labelledBy="starter-picker-title"
      panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="starter-picker-title" className="text-lg font-semibold tracking-tight text-slate-50">
        {title}
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">{intro}</p>

      {sections.map((s) => (
        <div key={s.name} className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            {s.emoji && <Emoji>{s.emoji}</Emoji>}
            {s.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {s.items.map((item) => {
              const on = picked.includes(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggle(item.key)}
                  aria-pressed={on}
                  className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition ${
                    on
                      ? "border-blue-400/70 bg-blue-500/10 text-blue-100"
                      : "border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <span className="text-sm">{item.label}</span>
                  {item.hint && <span className="text-[11px] text-slate-500">{item.hint}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={close}
          className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
        >
          I&apos;ll add my own
        </button>
        <button
          type="button"
          onClick={add}
          disabled={picked.length === 0}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {picked.length
            ? `Add ${picked.length} ${picked.length > 1 ? noun[1] : noun[0]}`
            : `Add ${noun[1]}`}
        </button>
      </div>
    </Modal>
  );
}

export default StarterPicker;
