"use client";

import { Modal } from "@/components/Modal";
import { X } from "@/components/icons";
import type { InventoryItem } from "@/features/inventory/lib/types";
import {
  relativeWhen,
  shortDate,
  upkeepTimeline,
  type UpkeepEntry,
} from "@/features/inventory/lib/maintenanceCalendar";

type MaintenanceCalendarModalProps = {
  open: boolean;
  items: InventoryItem[];
  today: string;
  onSelect: (item: InventoryItem) => void;
  onClose: () => void;
};

function KindChip({ kind }: { kind: UpkeepEntry["kind"] }) {
  return kind === "warranty" ? (
    <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300/90">
      🛡 Warranty ends
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-300/90">
      🔧 Maintenance
    </span>
  );
}

function Row({
  entry,
  onSelect,
}: {
  entry: UpkeepEntry;
  onSelect: (item: InventoryItem) => void;
}) {
  const overdue = entry.days < 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(entry.item)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-800/50"
      >
        <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
          {entry.item.name}
        </span>
        <KindChip kind={entry.kind} />
        <span className="shrink-0 text-right">
          <span className="block text-xs tabular-nums text-slate-300">
            {shortDate(entry.date)}
          </span>
          <span
            className={`block text-[10px] ${overdue ? "text-red-300/90" : "text-slate-500"}`}
          >
            {relativeWhen(entry.days)}
          </span>
        </span>
      </button>
    </li>
  );
}

export function MaintenanceCalendarModal({
  open,
  items,
  today,
  onSelect,
  onClose,
}: MaintenanceCalendarModalProps) {
  const buckets = upkeepTimeline(items, today);

  return (
    <Modal
      open={open}
      onClose={onClose}
      label="Upkeep calendar"
      panelClassName="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-50">Upkeep calendar</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:text-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Warranty expirations and maintenance dates, laid out as a calm timeline.
        Tap anything to open it.
      </p>

      {buckets.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-700/70 px-3 py-6 text-center text-sm text-slate-500">
          No upkeep dates yet — add a warranty or maintenance date to an item and
          it&apos;ll show up here.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {buckets.map((bucket) => (
            <section key={bucket.key}>
              <p
                className={`mb-1 text-[11px] font-medium uppercase tracking-wide ${
                  bucket.key === "overdue" ? "text-red-300/80" : "text-slate-400"
                }`}
              >
                {bucket.label}
              </p>
              <ul className="flex flex-col gap-0.5">
                {bucket.entries.map((entry) => (
                  <Row key={entry.id} entry={entry} onSelect={onSelect} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default MaintenanceCalendarModal;
