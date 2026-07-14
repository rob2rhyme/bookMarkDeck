"use client";

import { useMemo } from "react";

import { Modal } from "@/components/Modal";
import { HandHelping, Package, X } from "@/components/icons";
import { lendingLedger, type LendEntry } from "@/features/inventory/lib/lending";
import type { InventoryItem } from "@/features/inventory/lib/types";

type LendingLedgerModalProps = {
  open: boolean;
  items: InventoryItem[];
  today: string;
  onReturned: (id: string) => void;
  onEdit: (item: InventoryItem) => void;
  onClose: () => void;
};

const STATUS_CHIP: Record<string, string> = {
  overdue: "bg-red-500/20 text-red-200",
  "due-soon": "bg-amber-500/20 text-amber-200",
  "on-loan": "bg-slate-700/60 text-slate-200",
  "no-due": "bg-slate-800/70 text-slate-400",
};

function chipLabel({ status, daysUntilDue }: LendEntry): string {
  if (status === "overdue") return `Overdue ${Math.abs(daysUntilDue ?? 0)}d`;
  if (status === "due-soon")
    return daysUntilDue === 0 ? "Due today" : `Due in ${daysUntilDue}d`;
  if (status === "on-loan") return `Due in ${daysUntilDue}d`;
  return "No due date";
}

export function LendingLedgerModal({
  open,
  items,
  today,
  onReturned,
  onEdit,
  onClose,
}: LendingLedgerModalProps) {
  const ledger = useMemo(() => lendingLedger(items, today), [items, today]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="lending-title"
      panelClassName="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl outline-none"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          id="lending-title"
          className="flex items-center gap-2 text-base font-semibold text-slate-100"
        >
          <HandHelping className="h-5 w-5 text-violet-300" /> On loan
          {ledger.length > 0 && (
            <span className="rounded-full bg-violet-500/20 px-1.5 text-[11px] tabular-nums text-violet-100">
              {ledger.length}
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

      {ledger.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-slate-500">
          Nothing&apos;s out on loan — it&apos;s all home.
        </p>
      ) : (
        <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {ledger.map((entry) => {
            const { item, heldDays } = entry;
            const photo = item.photos[0]?.url;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2.5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-950/70">
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

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="block max-w-full truncate text-left text-sm font-medium text-slate-100 transition hover:text-blue-300"
                    title={item.name}
                  >
                    {item.name}
                  </button>
                  <p className="truncate text-xs text-slate-400">
                    <span className="text-violet-300">
                      {item.lentTo?.trim()}
                    </span>
                    {heldDays != null && heldDays >= 0 && (
                      <span> · out {heldDays}d</span>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CHIP[entry.status]}`}
                  >
                    {chipLabel(entry)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onReturned(item.id)}
                    className="rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-medium text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
                  >
                    Returned
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

export default LendingLedgerModal;
