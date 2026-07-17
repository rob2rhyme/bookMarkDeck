"use client";

import type { InventoryItem } from "@/features/inventory/lib/types";
import {
  attention,
  attentionCount,
  daysUntil,
  effectiveUseBy,
} from "@/features/inventory/lib/value";

type AttentionPanelProps = {
  items: InventoryItem[];
  today: string;
  onSelect: (item: InventoryItem) => void;
};

function Row({
  item,
  detail,
  tone,
  onSelect,
}: {
  item: InventoryItem;
  detail: string;
  tone: string;
  onSelect: (item: InventoryItem) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-800/50"
      >
        <span className="min-w-0 truncate text-sm text-slate-200">{item.name}</span>
        <span className={`shrink-0 text-xs font-medium ${tone}`}>{detail}</span>
      </button>
    </li>
  );
}

export function AttentionPanel({ items, today, onSelect }: AttentionPanelProps) {
  const a = attention(items, today);
  const count = attentionCount(a);

  if (count === 0) {
    return (
      <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-200">Attention</h3>
        <p className="mt-1 text-sm text-slate-500">
          Nothing needs a look — warranties and upkeep are current, and nothing&apos;s lent out.
        </p>
      </div>
    );
  }

  const overdueIds = new Set(a.returnOverdue.map((i) => i.id));

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-950/10 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
        Attention
        <span className="rounded-full bg-amber-500/20 px-1.5 text-[11px] tabular-nums text-amber-100">
          {count}
        </span>
      </h3>

      <div className="mt-3 flex flex-col gap-4">
        {a.warrantyExpired.length > 0 && (
          <section>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-red-300/80">
              Warranty ended
            </p>
            <ul className="flex flex-col gap-0.5">
              {a.warrantyExpired.map((i) => (
                <Row key={i.id} item={i} detail="expired" tone="text-red-300" onSelect={onSelect} />
              ))}
            </ul>
          </section>
        )}

        {a.warrantySoon.length > 0 && (
          <section>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-300/80">
              Warranty ending soon
            </p>
            <ul className="flex flex-col gap-0.5">
              {a.warrantySoon.map((i) => {
                const d = i.warrantyExpiry ? daysUntil(i.warrantyExpiry, today) : null;
                return (
                  <Row
                    key={i.id}
                    item={i}
                    detail={d != null ? `${d}d left` : "soon"}
                    tone="text-amber-300"
                    onSelect={onSelect}
                  />
                );
              })}
            </ul>
          </section>
        )}

        {a.useByExpired.length > 0 && (
          <section>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-red-300/80">
              Past use-by
            </p>
            <ul className="flex flex-col gap-0.5">
              {a.useByExpired.map((i) => {
                const ub = effectiveUseBy(i);
                const d = ub ? daysUntil(ub, today) : null;
                return (
                  <Row
                    key={i.id}
                    item={i}
                    detail={d != null ? `${Math.abs(d)}d past` : "past"}
                    tone="text-red-300"
                    onSelect={onSelect}
                  />
                );
              })}
            </ul>
          </section>
        )}

        {a.useBySoon.length > 0 && (
          <section>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-300/80">
              Use by soon
            </p>
            <ul className="flex flex-col gap-0.5">
              {a.useBySoon.map((i) => {
                const ub = effectiveUseBy(i);
                const d = ub ? daysUntil(ub, today) : null;
                return (
                  <Row
                    key={i.id}
                    item={i}
                    detail={d != null ? `${d}d left` : "soon"}
                    tone="text-amber-300"
                    onSelect={onSelect}
                  />
                );
              })}
            </ul>
          </section>
        )}

        {a.maintenanceOverdue.length > 0 && (
          <section>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-red-300/80">
              Maintenance overdue
            </p>
            <ul className="flex flex-col gap-0.5">
              {a.maintenanceOverdue.map((i) => {
                const d = i.maintenanceDate ? daysUntil(i.maintenanceDate, today) : null;
                return (
                  <Row
                    key={i.id}
                    item={i}
                    detail={d != null ? `${Math.abs(d)}d over` : "overdue"}
                    tone="text-red-300"
                    onSelect={onSelect}
                  />
                );
              })}
            </ul>
          </section>
        )}

        {a.maintenanceSoon.length > 0 && (
          <section>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-sky-300/80">
              Maintenance due soon
            </p>
            <ul className="flex flex-col gap-0.5">
              {a.maintenanceSoon.map((i) => {
                const d = i.maintenanceDate ? daysUntil(i.maintenanceDate, today) : null;
                return (
                  <Row
                    key={i.id}
                    item={i}
                    detail={d != null ? `${d}d left` : "soon"}
                    tone="text-sky-300"
                    onSelect={onSelect}
                  />
                );
              })}
            </ul>
          </section>
        )}

        {a.lentOut.length > 0 && (
          <section>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-violet-300/80">
              Lent out
            </p>
            <ul className="flex flex-col gap-0.5">
              {a.lentOut.map((i) => {
                const overdue = overdueIds.has(i.id);
                const d = i.dueDate ? daysUntil(i.dueDate, today) : null;
                const detail = overdue
                  ? `overdue ${Math.abs(d ?? 0)}d`
                  : i.lentTo
                    ? `with ${i.lentTo}`
                    : "lent";
                return (
                  <Row
                    key={i.id}
                    item={i}
                    detail={detail}
                    tone={overdue ? "text-red-300" : "text-violet-300"}
                    onSelect={onSelect}
                  />
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

export default AttentionPanel;
