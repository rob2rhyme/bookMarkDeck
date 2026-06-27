"use client";

// Shared "Show all / Show less" toggle for collapsing long dashboard sections so
// the page stays scannable. A section shows its top summary, then this button
// reveals the rest.

import { ChevronUp } from "@/components/icons";

type ExpandToggleProps = {
  expanded: boolean;
  onToggle: () => void;
  moreLabel?: string;
  lessLabel?: string;
  className?: string;
};

export function ExpandToggle({
  expanded,
  onToggle,
  moreLabel = "Show all",
  lessLabel = "Show less",
  className = "",
}: ExpandToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={`flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/40 py-2 text-xs font-medium text-slate-400 transition hover:border-slate-600 hover:text-slate-200 ${className}`}
    >
      {expanded ? lessLabel : moreLabel}
      <ChevronUp
        className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "" : "rotate-180"}`}
      />
    </button>
  );
}

export default ExpandToggle;
