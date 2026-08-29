"use client";

// The dashed "nothing here yet" panel, taken verbatim from the app's most-used
// empty-state string (10 exact copies across the focus pillar).
//
// `action` is where an empty state earns its keep: the fastest place to create
// the first item is the space where items will appear.

import { cn } from "@/lib/cn";

export const EMPTY_STATE_CLASS =
  "rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-400";

export type EmptyStateProps = {
  children: React.ReactNode;
  /** Optional call to action rendered under the message. */
  action?: React.ReactNode;
  className?: string;
};

/**
 * Renders a <p> — which is what every existing call site uses — and only
 * becomes a <div> when an `action` is present, since a <p> may not contain
 * block content.
 *
 * `className` is additive — use it for layout, not to restyle the panel.
 */
export function EmptyState({ children, action, className }: EmptyStateProps) {
  const cls = cn(EMPTY_STATE_CLASS, className);
  if (!action) return <p className={cls}>{children}</p>;
  return (
    <div className={cls}>
      {children}
      <div className="mt-3">{action}</div>
    </div>
  );
}

export default EmptyState;
