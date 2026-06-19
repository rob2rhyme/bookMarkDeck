"use client";

import type { Folder } from "@/types/folder";

type CollectionPickerProps = {
  folders: Folder[];
  value: string | null;
  onChange: (folderId: string | null) => void;
};

/**
 * Lets the user link the current focus session to one of their bookmark folders.
 * Read-only over the existing folder data — never mutates it.
 */
export function CollectionPicker({
  folders,
  value,
  onChange,
}: CollectionPickerProps) {
  const sorted = [...folders].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  return (
    <label className="flex items-center gap-2 text-sm text-slate-400">
      <span className="shrink-0">Working from</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-100 focus:border-blue-400 focus:outline-none"
      >
        <option value="">No collection</option>
        {sorted.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default CollectionPicker;
