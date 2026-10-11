"use client";

import { Modal } from "@/components/Modal";
import { X } from "@/components/icons";
import type { InventoryItem } from "@/features/inventory/lib/types";
import { borrowedLedger, type BorrowEntry } from "@/features/inventory/lib/borrowed";
import { formatMoney, taxAmount } from "@/features/inventory/lib/value";
import { dayKeyOf } from "@/lib/dayKey";

type BorrowedLedgerModalProps = {
  open: boolean;
  items: InventoryItem[];
  fallbackCurrency: string;
  today: string;
  /** Open the item's detail view (tap a row). */
  onPick: (item: InventoryItem) => void;
  /** Gave it back — flips the item to the shared 🔙 Returned status. */
  onGiveBack: (id: string) => void;
  onClose: () => void;
};

function Row({
  e,
  currency,
  onPick,
  onGiveBack,
}: {
  e: BorrowEntry;
  currency: string;
  onPick: (item: InventoryItem) => void;
  onGiveBack?: (id: string) => void;
}) {
  const i = e.item;
  const cur = i.currency ?? currency;
  const returnedDay = e.returnedAt ? dayKeyOf(e.returnedAt) : null;
  return (
    <li
      className={`rounded-lg border bg-slate-950/40 px-3 py-2 ${
        e.overdue && onGiveBack ? "border-red-500/40" : "border-slate-800/70"
      }`}
    >
      <div className="flex items-center gap-2">
        {i.photos[0]?.url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={i.photos[0].url}
            alt={i.name}
            loading="lazy"
            className="h-10 w-10 shrink-0 rounded-lg border border-slate-800 bg-slate-900 object-contain"
          />
        )}
        <button
          type="button"
          onClick={() => onPick(i)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-sm text-slate-100">
            {i.origin === "rented" ? "🏷" : "🤲"} {i.name}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            {e.from && <span>from {e.from}</span>}
            {e.cost > 0 && (
              <span className="tabular-nums text-emerald-300/90">
                {formatMoney(e.cost, cur)}
                {taxAmount(i) > 0 ? " incl. tax" : ""}
              </span>
            )}
            {i.warrantyExpiry && <span>warranty {i.warrantyExpiry}</span>}
            {onGiveBack ? (
              e.returnBy ? (
                <span className={e.overdue ? "font-medium text-red-300" : ""}>
                  {e.overdue
                    ? `overdue ${Math.abs(e.daysLeft ?? 0)}d`
                    : `due ${e.returnBy}`}
                </span>
              ) : null
            ) : (
              <span>
                returned{returnedDay ? ` ${returnedDay}` : ""}
              </span>
            )}
          </span>
        </button>
        {onGiveBack && (
          <button
            type="button"
            onClick={() => onGiveBack(i.id)}
            title="Gave it back"
            className="shrink-0 rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
          >
            🔙 Gave back
          </button>
        )}
      </div>
    </li>
  );
}

/** The mirror of the lending ledger: what you've borrowed/rented from others
 *  (due dates, what it cost incl. tax) and the history of what went back. */
export function BorrowedLedgerModal({
  open,
  items,
  fallbackCurrency,
  today,
  onPick,
  onGiveBack,
  onClose,
}: BorrowedLedgerModalProps) {
  const { out, history } = borrowedLedger(items, today);

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="borrowed-title"
      overlayClassName="inset-0 flex items-stretch justify-center sm:items-center sm:px-4 sm:py-[5vh]"
      panelClassName="flex w-full flex-col max-h-[100dvh] overflow-y-auto overflow-x-hidden bg-slate-900 p-4 shadow-2xl outline-none sm:block sm:max-w-md sm:max-h-[88vh] sm:rounded-2xl sm:border sm:border-slate-800 sm:p-6"
    >
      <div className="flex items-center justify-between max-sm:sticky max-sm:-top-4 max-sm:z-10 max-sm:-mx-4 max-sm:-mt-4 max-sm:border-b max-sm:border-slate-800/70 max-sm:bg-slate-900/95 max-sm:px-4 max-sm:pb-2.5 max-sm:pt-4 max-sm:backdrop-blur">
        <h2 id="borrowed-title" className="text-lg font-semibold text-slate-50">
          🤲 Borrowed &amp; rented
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <p className="mt-2 text-sm text-slate-400">
        Things in your care that belong to someone else. They get every item
        power — scan, photos, a location — but stay out of your value totals;
        the fees you paid still count as spend.
      </p>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        In your care now
      </h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {out.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-700/70 px-3 py-5 text-center text-sm text-slate-500">
            Nothing borrowed or rented right now — mark one via{" "}
            <em>Ownership</em> in the item form.
          </li>
        ) : (
          out.map((e) => (
            <Row
              key={e.item.id}
              e={e}
              currency={fallbackCurrency}
              onPick={onPick}
              onGiveBack={onGiveBack}
            />
          ))
        )}
      </ul>

      {history.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Returned history
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {history.map((e) => (
              <Row key={e.item.id} e={e} currency={fallbackCurrency} onPick={onPick} />
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
