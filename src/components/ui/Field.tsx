"use client";

// The canonical text field, taken verbatim from the app's most-used input
// string (18 exact copies across the bookmarks surface).
//
// A second, older field style exists in the feature modals (rounded-lg,
// border-slate-700, bg-slate-950/60, focus:border-blue-400). It is deliberately
// NOT unified here: converting it is a real visual change and belongs in its
// own reviewable commit, not in a no-op extraction.

import { cn } from "@/lib/cn";

export const FIELD_CLASS =
  "w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/** `className` is additive — use it for layout, not to restyle the field. */
export function Input({ className, ...rest }: InputProps) {
  return <input className={cn(FIELD_CLASS, className)} {...rest} />;
}

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea className={cn(FIELD_CLASS, className)} {...rest} />;
}

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, ...rest }: SelectProps) {
  return <select className={cn(FIELD_CLASS, className)} {...rest} />;
}

export default Input;
