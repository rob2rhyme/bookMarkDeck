"use client";

// Vertical-3-dots overflow menu for habit rows/cards. On desktop it's an inline
// dropdown; on mobile it opens a bottom action sheet over a blurred backdrop —
// portalled to <body> so it floats above every card instead of being clipped
// behind later rows (which create their own stacking contexts). Closes on
// outside-click / backdrop tap / Escape / Cancel.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null); // the dots button wrapper
  const sheetRef = useRef<HTMLDivElement | null>(null); // the mobile sheet backdrop

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const isMobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches;
    const prevOverflow = document.body.style.overflow;
    if (isMobile) document.body.style.overflow = "hidden";

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (sheetRef.current?.contains(t)) return; // sheet handles its own taps
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      if (isMobile) document.body.style.overflow = prevOverflow;
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

      {/* Desktop: inline dropdown. */}
      {open && (
        <div className="animate-bd-scale-in absolute right-0 z-30 mt-1 hidden w-44 origin-top-right overflow-hidden rounded-xl border border-slate-800 bg-slate-900 py-1 shadow-xl sm:block">
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

      {/* Mobile: bottom action sheet, portalled above all cards. */}
      {open &&
        mounted &&
        createPortal(
          <div
            ref={sheetRef}
            style={{ bottom: "var(--bottom-nav-h)" }}
            className="animate-bd-fade-in fixed inset-x-0 top-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:hidden"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={label}
              onClick={(e) => e.stopPropagation()}
              className="animate-bd-slide-up-fade w-full max-w-md rounded-t-2xl border-t border-slate-800 bg-slate-950 p-2 pb-3 shadow-2xl"
            >
              <div
                className="mx-auto my-1.5 h-1 w-10 rounded-full bg-slate-700"
                aria-hidden="true"
              />
              <p className="truncate px-3 pb-2 text-xs font-medium text-slate-400">
                {label}
              </p>
              {items.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  onClick={() => run(it.onClick)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                    it.danger
                      ? "text-red-300 active:bg-red-950/40"
                      : "text-slate-100 active:bg-slate-800"
                  }`}
                >
                  {it.icon}
                  {it.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-1 w-full rounded-xl border border-slate-800 px-3 py-3 text-sm font-medium text-slate-300 transition active:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default RowMenu;
