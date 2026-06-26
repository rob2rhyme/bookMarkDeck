"use client";

// Compact vertical-3-dots overflow menu for habit rows/cards: a single button
// that reveals a dropdown of secondary actions. Closes on outside-click or
// Escape. Mirrors the menu the Simple view already uses, so Classic rows can
// collapse their action clusters the same way.

import { useEffect, useRef, useState } from "react";

import { DotsVertical } from "@/components/icons";

export type RowMenuItem = {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
};

export function RowMenu({
  items,
  label,
}: {
  items: RowMenuItem[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-800/60 hover:text-slate-300"
      >
        <DotsVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 py-1 shadow-xl">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => run(it.onClick)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                it.danger
                  ? "border-t border-slate-800/60 text-red-400/90 hover:bg-red-950/40 hover:text-red-300"
                  : "text-slate-200 hover:bg-slate-800"
              }`}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default RowMenu;
