"use client";

import { Modal } from "@/components/Modal";
import { ExternalLink, X } from "@/components/icons";
import type { InventoryItem } from "@/features/inventory/lib/types";
import { subscriptionLedger } from "@/features/inventory/lib/digital";
import { formatMoney } from "@/features/inventory/lib/value";

type SubscriptionsModalProps = {
  open: boolean;
  items: InventoryItem[];
  fallbackCurrency: string;
  today: string;
  onPick: (item: InventoryItem) => void;
  onClose: () => void;
};

/** "What am I paying for?" — active subscriptions soonest-renewal-first with
 *  the recurring totals, plus one-time digital purchases and their spend. */
export function SubscriptionsModal({
  open,
  items,
  fallbackCurrency,
  today,
  onPick,
  onClose,
}: SubscriptionsModalProps) {
  const ledger = subscriptionLedger(items, today);

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="subs-title"
      overlayClassName="inset-0 flex items-stretch justify-center sm:items-center sm:px-4 sm:py-[5vh]"
      panelClassName="flex w-full flex-col max-h-[100dvh] overflow-y-auto overflow-x-hidden bg-slate-900 p-4 shadow-2xl outline-none sm:block sm:max-w-md sm:max-h-[88vh] sm:rounded-2xl sm:border sm:border-slate-800 sm:p-6"
    >
      <div className="flex items-center justify-between max-sm:sticky max-sm:-top-4 max-sm:z-10 max-sm:-mx-4 max-sm:-mt-4 max-sm:border-b max-sm:border-slate-800/70 max-sm:bg-slate-900/95 max-sm:px-4 max-sm:pb-2.5 max-sm:pt-4 max-sm:backdrop-blur">
        <h2 id="subs-title" className="text-lg font-semibold text-slate-50">
          💳 Subscriptions &amp; digital
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

      {ledger.subs.length > 0 && (
        <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
          You&apos;re paying{" "}
          <span className="font-semibold tabular-nums text-cyan-300">
            ≈ {formatMoney(ledger.monthlyTotal, fallbackCurrency)}/mo
          </span>{" "}
          (
          <span className="tabular-nums">
            {formatMoney(ledger.yearlyTotal, fallbackCurrency)}/yr
          </span>
          ) across {ledger.subs.length} subscription
          {ledger.subs.length === 1 ? "" : "s"} — tax included.
        </p>
      )}

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Active subscriptions
      </h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {ledger.subs.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-700/70 px-3 py-5 text-center text-sm text-slate-500">
            No subscriptions tracked — add a 💾 Digital item with a monthly or
            yearly billing cycle.
          </li>
        ) : (
          ledger.subs.map((e) => {
            const i = e.item;
            const cur = i.currency ?? fallbackCurrency;
            return (
              <li
                key={i.id}
                className={`rounded-lg border bg-slate-950/40 px-3 py-2 ${
                  e.daysLeft !== null && e.daysLeft <= 7
                    ? "border-amber-500/40"
                    : "border-slate-800/70"
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPick(i)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm text-slate-100">
                      {i.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="tabular-nums text-emerald-300/90">
                        {formatMoney(e.perCycle, cur)}/
                        {i.billingCycle === "monthly" ? "mo" : "yr"}
                      </span>
                      {i.billingCycle === "yearly" && (
                        <span className="tabular-nums">
                          ≈ {formatMoney(e.monthly, cur)}/mo
                        </span>
                      )}
                      {i.retailer && <span>{i.retailer}</span>}
                      {e.nextOn && (
                        <span
                          className={
                            e.daysLeft !== null && e.daysLeft <= 7
                              ? "font-medium text-amber-300"
                              : ""
                          }
                        >
                          renews {e.nextOn}
                          {e.daysLeft !== null && ` (${e.daysLeft}d)`}
                        </span>
                      )}
                    </span>
                  </button>
                  {i.storeUrl && (
                    <a
                      href={i.storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Manage / cancel"
                      className="shrink-0 rounded-full border border-slate-700 p-1.5 text-slate-400 transition hover:border-cyan-400 hover:text-cyan-300"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>

      {ledger.oneTime.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            One-time purchases ·{" "}
            <span className="tabular-nums text-slate-300">
              {formatMoney(ledger.oneTimeSpend, fallbackCurrency)}
            </span>
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {ledger.oneTime.map((i) => (
              <li
                key={i.id}
                className="rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => onPick(i)}
                  className="min-w-0 w-full text-left"
                >
                  <span className="block truncate text-sm text-slate-100">
                    {i.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    {i.price != null && (
                      <span className="tabular-nums text-emerald-300/90">
                        {formatMoney(i.price, i.currency ?? fallbackCurrency)}
                      </span>
                    )}
                    {i.retailer && <span>{i.retailer}</span>}
                    {i.serial && <span>🔑 licensed</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
