"use client";

// Small "• List" button for note editors. Inserts a fresh bullet line into the
// note (see appendBullet). onMouseDown is prevented so clicking it doesn't blur
// the textarea the user is typing in.

const BTN_CLASS =
  "inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200";

export function BulletButton({
  onInsert,
  className = "",
}: {
  onInsert: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onInsert}
      title="Add a bullet point"
      aria-label="Add a bullet point"
      className={`${BTN_CLASS} ${className}`}
    >
      • List
    </button>
  );
}

// "1. List" button — inserts the next numbered line (see appendNumber).
export function NumberButton({
  onInsert,
  className = "",
}: {
  onInsert: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onInsert}
      title="Add a numbered item"
      aria-label="Add a numbered item"
      className={`${BTN_CLASS} ${className}`}
    >
      1. List
    </button>
  );
}

export default BulletButton;
