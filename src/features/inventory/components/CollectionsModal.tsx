"use client";

import { useMemo } from "react";

import { Modal } from "@/components/Modal";
import { Layers, Package, X } from "@/components/icons";
import { collectionGroups } from "@/features/inventory/lib/collections";
import type { InventoryItem } from "@/features/inventory/lib/types";
import { formatMoney, itemValue } from "@/features/inventory/lib/value";

type CollectionsModalProps = {
  open: boolean;
  items: InventoryItem[];
  currency: string;
  onEdit: (item: InventoryItem) => void;
  onClose: () => void;
};

export function CollectionsModal({
  open,
  items,
  currency,
  onEdit,
  onClose,
}: CollectionsModalProps) {
  const groups = useMemo(() => collectionGroups(items), [items]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="collections-title"
      panelClassName="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl outline-none"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          id="collections-title"
          className="flex items-center gap-2 text-base font-semibold text-slate-100"
        >
          <Layers className="h-5 w-5 text-teal-300" /> Kits &amp; collections
          {groups.length > 0 && (
            <span className="rounded-full bg-teal-500/20 px-1.5 text-[11px] tabular-nums text-teal-100">
              {groups.length}
            </span>
          )}
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

      {groups.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-slate-500">
          No kits yet. Give a few items the same <em>Collection / kit</em> name —
          a camera bag, a board-game shelf — and they gather here.
        </p>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {groups.map((g) => (
            <section key={g.name}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
                  {g.name}
                  <span className="text-xs tabular-nums text-slate-500">
                    {g.count} item{g.count === 1 ? "" : "s"}
                  </span>
                </p>
                {g.totalValue > 0 && (
                  <span className="shrink-0 text-xs font-medium tabular-nums text-emerald-300">
                    {formatMoney(g.totalValue, currency)}
                  </span>
                )}
              </div>
              <ul className="flex flex-col gap-1">
                {g.items.map((item) => {
                  const photo = item.photos[0]?.url;
                  const value = itemValue(item);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 text-left transition hover:border-slate-700 hover:bg-slate-800/50"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-950/70">
                          {photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photo}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <Package className="h-4 w-4 text-slate-600" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                          {item.name}
                        </span>
                        {value > 0 && (
                          <span className="shrink-0 text-xs tabular-nums text-slate-400">
                            {formatMoney(value, item.currency ?? currency)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default CollectionsModal;
