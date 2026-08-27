"use client";

// The small uppercase label above a group of controls. Matches the string used
// across the settings panels and dashboards.

import { cn } from "@/lib/cn";

export const SECTION_LABEL_CLASS =
  "text-[11px] font-medium uppercase tracking-wide text-slate-500";

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn(SECTION_LABEL_CLASS, className)}>{children}</p>;
}

export default SectionLabel;
