"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { MapPin, Package, Search, X } from "@/components/icons";
import { whereIs } from "@/features/inventory/lib/inventorySearch";
import type {
  InventoryItem,
  InventoryLocation,
} from "@/features/inventory/lib/types";

type WhereIsModalProps = {
  open: boolean;
  items: InventoryItem[];
  locations: InventoryLocation[];
  onPick: (item: InventoryItem) => void;
  onClose: () => void;
};

/** Root→leaf breadcrumb, or the lending/no-location answer when there's no path. */
function WhereLine({ item, path }: { item: InventoryItem; path: string[] }) {
  const lent = item.lentTo?.trim();

  if (lent) {
    return (
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
        <span className="font-medium text-violet-200">With {lent}</span>
        {path.length > 0 && (
          <span className="text-xs text-slate-500">· usually {path.join(" › ")}</span>
        )}
      </span>
    );
  }

  if (path.length === 0) {
    return <span className="text-sm text-slate-500">No location set</span>;
  }

  return (
    <span className="flex flex-wrap items-center gap-1 text-sm">
      {path.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-600">›</span>}
          <span
            className={
              i === path.length - 1
                ? "font-medium text-blue-200"
                : "text-slate-400"
            }
          >
            {seg}
          </span>
        </span>
      ))}
    </span>
  );
}

export function WhereIsModal({
  open,
  items,
  locations,
  onPick,
  onClose,
}: WhereIsModalProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Fresh box each time it opens; focus the field.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const results = useMemo(
    () => (query.trim() ? whereIs(items, locations, query, 8) : []),
    [items, locations, query]
  );

  const pick = (item: InventoryItem) => {
    onPick(item);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="where-is-title"
      panelClassName="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl outline-none"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          id="where-is-title"
          className="flex items-center gap-2 text-base font-semibold text-slate-100"
        >
          <MapPin className="h-5 w-5 text-blue-300" /> Where is it?
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
          <Search className="h-4 w-4" />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What are you looking for? e.g. passport"
          aria-label="What are you looking for?"
          className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2.5 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear"
            className="absolute inset-y-0 right-2 flex items-center text-slate-500 transition hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3 max-h-[50vh] overflow-y-auto">
        {!query.trim() ? (
          <p className="px-1 py-6 text-center text-sm text-slate-500">
            Type an item name — I&apos;ll tell you where it lives.
          </p>
        ) : results.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-slate-500">
            No match. Try fewer letters or a different word.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {results.map(({ item, path }) => {
              const photo = item.photos[0]?.url;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pick(item)}
                    className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-slate-700 hover:bg-slate-800/50"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-950/70">
                      {photo ? (
                        // Arbitrary user URLs aren't in next/image's allowlist.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Package className="h-5 w-5 text-slate-600" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-slate-400">
                        {item.name}
                      </span>
                      <WhereLine item={item} path={path} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export default WhereIsModal;
