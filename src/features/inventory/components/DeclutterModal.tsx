"use client";

import { useMemo } from "react";

import { Modal } from "@/components/Modal";
import { Package, Sparkles, X } from "@/components/icons";
import {
  declutterItems,
  declutterSummary,
} from "@/features/inventory/lib/declutter";
import {
  DISPOSITIONS,
  type InventoryItem,
  type ItemDisposition,
} from "@/features/inventory/lib/types";
import { formatMoney, itemValue } from "@/features/inventory/lib/value";

type DeclutterModalProps = {
  open: boolean;
  items: InventoryItem[];
  currency: string;
  onReleased: (id: string) => void;
  onEdit: (item: InventoryItem) => void;
  onClose: () => void;
};

const TONE: Record<ItemDisposition, string> = {
  sell: "bg-emerald-500/15 text-emerald-200",
  donate: "bg-sky-500/15 text-sky-200",
  giveaway: "bg-violet-500/15 text-violet-200",
  trash: "bg-slate-600/40 text-slate-300",
};

export function DeclutterModal({
  open,
  items,
  currency,
  onReleased,
  onEdit,
  onClose,
}: DeclutterModalProps) {
  const pile = useMemo(() => declutterItems(items), [items]);
  const summary = useMemo(() => declutterSummary(items), [items]);
  const labelOf = (d: ItemDisposition) =>
    DISPOSITIONS.find((x) => x.id === d)?.label ?? d;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="declutter-title"
      panelClassName="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl outline-none"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3
          id="declutter-title"
          className="flex items-center gap-2 text-base font-semibold text-slate-100"
        >
          <Sparkles className="h-5 w-5 text-emerald-300" /> Declutter
          {pile.length > 0 && (
            <span className="rounded-full bg-emerald-500/20 px-1.5 text-[11px] tabular-nums text-emerald-100">
              {pile.length}
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

      {summary.sellValue > 0 && (
        <p className="mb-3 text-xs text-slate-400">
          ≈{" "}
          <span className="font-medium text-emerald-300">
            {formatMoney(summary.sellValue, currency)}
          </span>{" "}
          to recoup from items to sell.
        </p>
      )}

      {pile.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-slate-500">
          Nothing tagged to move on. Set an item&apos;s disposition to
          donate, sell, give away, or toss and it lands here.
        </p>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {DISPOSITIONS.filter((d) => summary.byDisposition[d.id] > 0).map(
            (d) => (
              <section key={d.id}>
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {d.label}
                  <span className="tabular-nums text-slate-500">
                    {summary.byDisposition[d.id]}
                  </span>
                </p>
                <ul className="flex flex-col gap-1.5">
                  {pile
                    .filter((i) => i.disposition === d.id)
                    .map((item) => {
                      const photo = item.photos[0]?.url;
                      const value = itemValue(item);
                      return (
                        <li
                          key={item.id}
                          className="flex items-center gap-3 rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-950/70">
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
                          <button
                            type="button"
                            onClick={() => onEdit(item)}
                            className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-100 transition hover:text-blue-300"
                            title={item.name}
                          >
                            {item.name}
                          </button>
                          {d.id === "sell" && value > 0 && (
                            <span className="shrink-0 text-xs font-medium tabular-nums text-emerald-300">
                              {formatMoney(value, item.currency ?? currency)}
                            </span>
                          )}
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE[d.id]}`}
                          >
                            {labelOf(d.id)}
                          </span>
                          <button
                            type="button"
                            onClick={() => onReleased(item.id)}
                            className="shrink-0 rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-medium text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
                          >
                            Let go
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </section>
            )
          )}
        </div>
      )}
    </Modal>
  );
}

export default DeclutterModal;
