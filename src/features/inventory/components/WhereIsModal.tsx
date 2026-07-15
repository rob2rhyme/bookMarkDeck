"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { MapPin, Package, Search, X } from "@/components/icons";
import { locationPathsById, whereIs } from "@/features/inventory/lib/inventorySearch";
import { smartAnswers, type SmartTone } from "@/features/inventory/lib/smartQuestions";
import type {
  InventoryItem,
  InventoryLocation,
} from "@/features/inventory/lib/types";

type WhereIsModalProps = {
  open: boolean;
  items: InventoryItem[];
  locations: InventoryLocation[];
  today: string; // YYYY-MM-DD — for the time-based questions
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
              i === path.length - 1 ? "font-medium text-blue-200" : "text-slate-400"
            }
          >
            {seg}
          </span>
        </span>
      ))}
    </span>
  );
}

function ItemRow({
  item,
  path,
  onPick,
}: {
  item: InventoryItem;
  path: string[];
  onPick: (item: InventoryItem) => void;
}) {
  const photo = item.photos[0]?.url;
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(item)}
        className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-slate-700 hover:bg-slate-800/50"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-950/70">
          {photo ? (
            // Arbitrary user URLs aren't in next/image's allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Package className="h-5 w-5 text-slate-600" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-slate-400">{item.name}</span>
          <WhereLine item={item} path={path} />
        </span>
      </button>
    </li>
  );
}

const CHIP_TONE: Record<SmartTone, string> = {
  urgent: "border-red-500/30 bg-red-500/5 text-red-200 hover:border-red-400/60",
  info: "border-slate-700 bg-slate-900 text-slate-200 hover:border-blue-400/60",
  neutral: "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-600",
};

export function WhereIsModal({
  open,
  items,
  locations,
  today,
  onPick,
  onClose,
}: WhereIsModalProps) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Fresh box each time it opens; focus the field.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveId(null);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const results = useMemo(
    () => (query.trim() ? whereIs(items, locations, query, 8) : []),
    [items, locations, query]
  );
  const answers = useMemo(() => smartAnswers(items, today), [items, today]);
  const paths = useMemo(() => locationPathsById(locations), [locations]);
  const pathOf = (item: InventoryItem) =>
    item.locationId ? paths[item.locationId] ?? [] : [];

  const active = activeId ? answers.find((a) => a.id === activeId) ?? null : null;

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
          <MapPin className="h-5 w-5 text-blue-300" /> Find &amp; ask
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
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim()) setActiveId(null);
          }}
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

      <div className="mt-3 max-h-[55vh] overflow-y-auto">
        {query.trim() ? (
          /* Free-text "where is it?" find */
          results.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-slate-500">
              No match. Try fewer letters or a different word.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {results.map(({ item, path }) => (
                <ItemRow key={item.id} item={item} path={path} onPick={pick} />
              ))}
            </ul>
          )
        ) : active ? (
          /* A chosen question's answer */
          <div>
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:text-slate-200"
            >
              ‹ Back to questions
            </button>
            <p className="mb-1 px-1 text-sm font-medium text-slate-200">
              {active.emoji} {active.label}
              <span className="ml-1.5 text-slate-500 tabular-nums">
                ({active.items.length})
              </span>
            </p>
            <ul className="flex flex-col gap-1">
              {active.items.map((item) => (
                <ItemRow key={item.id} item={item} path={pathOf(item)} onPick={pick} />
              ))}
            </ul>
          </div>
        ) : answers.length > 0 ? (
          /* The question chips */
          <div>
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Or ask about your stuff
            </p>
            <div className="flex flex-wrap gap-1.5">
              {answers.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveId(a.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${CHIP_TONE[a.tone]}`}
                >
                  <span aria-hidden>{a.emoji}</span>
                  {a.label}
                  <span className="tabular-nums opacity-70">{a.items.length}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="px-1 py-6 text-center text-sm text-slate-500">
            Type an item name — I&apos;ll tell you where it lives.
          </p>
        )}
      </div>
    </Modal>
  );
}

export default WhereIsModal;
