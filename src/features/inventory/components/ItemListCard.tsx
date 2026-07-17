"use client";

import { Archive, ExternalLink, Package, Pencil, Trash2 } from "@/components/icons";
import {
  CONDITIONS,
  DISPOSITIONS,
  type InventoryItem,
} from "@/features/inventory/lib/types";
import {
  formatMoney,
  itemValue,
  paidWithTax,
  taxAmount,
  warrantyState,
} from "@/features/inventory/lib/value";

type ItemListCardProps = {
  item: InventoryItem;
  locationName?: string;
  fallbackCurrency: string;
  today: string;
  onOpen: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  onWish: (item: InventoryItem) => void; // "want another" → prefilled wish
  onArchive: (item: InventoryItem) => void;
  onRemove: (item: InventoryItem) => void;
};

const WARRANTY_BADGE: Record<string, { label: string; cls: string }> = {
  expired: { label: "Warranty ended", cls: "bg-red-500/20 text-red-200" },
  soon: { label: "Warranty ending", cls: "bg-amber-500/20 text-amber-200" },
};

function Chip({ children, cls }: { children: React.ReactNode; cls?: string }) {
  return (
    <span
      className={`max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-medium ${
        cls ?? "bg-slate-800/80 text-slate-300"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Landscape "all-details" row for the list view — photo left, everything else
 * right. Shares the Rediscover card's calm surface, but surfaces the full
 * record (facts, chips, links, price+tax) so the list reads like a ledger.
 */
export function ItemListCard({
  item,
  locationName,
  fallbackCurrency,
  today,
  onOpen,
  onEdit,
  onWish,
  onArchive,
  onRemove,
}: ItemListCardProps) {
  const currency = item.currency ?? fallbackCurrency;
  const value = itemValue(item);
  const tax = taxAmount(item);
  // Same rule as the grid card: no manual value → the figure is the paid
  // price, shown tax-inclusive.
  const paid = paidWithTax(item);
  const costShown = item.value == null && paid > 0;
  const display = costShown ? paid : value;
  const photo = item.photos[0]?.url;
  const badge = WARRANTY_BADGE[warrantyState(item, today)];
  const conditionLabel = item.condition
    ? CONDITIONS.find((c) => c.id === item.condition)?.label ?? item.condition
    : null;

  const facts: string[] = [];
  if (item.status === "returned") facts.push("🔙 Returned — not in totals");
  if (item.origin) {
    facts.push(
      `${item.origin === "rented" ? "🏷 Rented" : "🤲 Borrowed"}${
        item.borrowedFrom ? ` from ${item.borrowedFrom}` : ""
      }${item.borrowReturnBy && item.status !== "returned" ? ` · return by ${item.borrowReturnBy}` : ""}`
    );
  }
  if (item.price != null || item.warrantyCost != null) {
    facts.push(
      tax > 0 || (item.warrantyCost ?? 0) > 0
        ? `Paid ${formatMoney(paidWithTax(item), currency)} (incl. tax${
            item.warrantyCost ? " + warranty" : ""
          })`
        : `Paid ${formatMoney(item.price ?? 0, currency)}`
    );
  }
  if (item.purchaseDate) facts.push(`Bought ${item.purchaseDate}`);
  if (item.warrantyExpiry || item.warrantyYears) {
    facts.push(
      `Warranty ${[
        item.warrantyYears ? `${item.warrantyYears} yr` : null,
        item.warrantyExpiry ? `→ ${item.warrantyExpiry}` : null,
      ]
        .filter(Boolean)
        .join(" ")}`
    );
  }
  if (item.maintenanceDate) facts.push(`Upkeep ${item.maintenanceDate}`);
  const makerModel = [item.manufacturer, item.model].filter(Boolean).join(" ");
  if (makerModel) facts.push(makerModel);
  if (item.serial) facts.push(`SN ${item.serial}`);
  if (item.barcode) facts.push(`#${item.barcode}`);

  return (
    <div className="group flex gap-3 overflow-hidden rounded-2xl border border-slate-800/70 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-700 hover:shadow-lg hover:shadow-slate-950/40 motion-reduce:hover:translate-y-0 sm:gap-4 sm:p-4">
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={`View ${item.name}`}
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-950/60 sm:h-28 sm:w-28"
      >
        {photo ? (
          // Arbitrary user URLs aren't in next/image's allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={item.name}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-700">
            <Package className="h-8 w-8" />
          </div>
        )}
        {item.photos.length > 1 && (
          <span className="absolute bottom-1 right-1 rounded-full bg-slate-950/70 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-slate-200 backdrop-blur">
            📷 {item.photos.length}
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpen(item)}
            title={item.name}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-100 transition hover:text-blue-200 sm:text-base"
          >
            {item.name}
          </button>
          <div className="flex shrink-0 flex-col items-end">
            {display > 0 && (
              <span
                title={costShown ? "Total paid (incl. tax)" : "Estimated value"}
                className="text-sm font-semibold tabular-nums text-emerald-300"
              >
                {formatMoney(display, currency)}
              </span>
            )}
            {item.quantity > 1 && (
              <span className="text-[10px] text-slate-500 tabular-nums">
                ×{item.quantity}
              </span>
            )}
          </div>
        </div>

        {item.description && (
          <p className="truncate text-xs text-slate-400">{item.description}</p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Chip>📍 {locationName ?? "Unassigned"}</Chip>
          {item.category && (
            <Chip cls="bg-blue-500/15 text-blue-200">{item.category}</Chip>
          )}
          {conditionLabel && <Chip>{conditionLabel}</Chip>}
          {item.inBox === true && <Chip>📦 In box</Chip>}
          {item.inBox === false && <Chip>📭 Unboxed</Chip>}
          {item.projectName && (
            <Chip cls="bg-indigo-500/15 text-indigo-200">🎯 {item.projectName}</Chip>
          )}
          {item.collection && (
            <Chip cls="bg-teal-500/15 text-teal-200">🧰 {item.collection}</Chip>
          )}
          {item.disposition && (
            <Chip cls="bg-amber-500/15 text-amber-200">
              ✨{" "}
              {DISPOSITIONS.find((d) => d.id === item.disposition)?.label ??
                item.disposition}
            </Chip>
          )}
          {item.lentTo && (
            <Chip cls="bg-violet-500/25 text-violet-100">
              Lent · {item.lentTo}
              {item.dueDate ? ` · due ${item.dueDate}` : ""}
            </Chip>
          )}
          {badge && <Chip cls={badge.cls}>{badge.label}</Chip>}
        </div>

        {facts.length > 0 && (
          <p className="truncate text-[11px] text-slate-500">
            {facts.join(" · ")}
          </p>
        )}

        <div className="flex items-end justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {item.storeUrl && (
              <a
                href={item.storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={item.storeUrl}
                className="inline-flex items-center gap-1 rounded-full border border-blue-400/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-200 transition hover:border-blue-400/60 hover:text-blue-100"
              >
                🛒 Store <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {item.compareLinks && item.compareLinks.length > 0 && (
              <Chip cls="bg-slate-800/80 text-slate-300">
                ⚖ {item.compareLinks.length} to compare
              </Chip>
            )}
            {item.links.slice(0, 2).map((l) => (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                title={l.url}
                className="inline-flex max-w-[10rem] items-center truncate rounded-full border border-blue-400/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-200 transition hover:border-blue-400/60 hover:text-blue-100"
              >
                🔗 {l.title}
              </a>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
            <button
              type="button"
              onClick={() => onWish(item)}
              aria-label={`Add ${item.name} to Wishlist`}
              title="Add to Wishlist — want another"
              className="rounded-md p-1.5 text-sm leading-none text-slate-500 transition hover:bg-slate-800 hover:text-pink-300"
            >
              ♡
            </button>
            <button
              type="button"
              onClick={() => onEdit(item)}
              aria-label={`Edit ${item.name}`}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-blue-300"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onArchive(item)}
              aria-label={`${item.archived ? "Unarchive" : "Archive"} ${item.name}`}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-amber-300"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onRemove(item)}
              aria-label={`Delete ${item.name}`}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ItemListCard;
