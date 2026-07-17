"use client";

import { Archive, Package, Pencil, Trash2 } from "@/components/icons";
import { CONDITIONS, DISPOSITIONS, type InventoryItem } from "@/features/inventory/lib/types";
import { formatMoney, itemValue, paidWithTax, warrantyState } from "@/features/inventory/lib/value";

type ItemCardProps = {
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

export function ItemCard({
  item,
  locationName,
  fallbackCurrency,
  today,
  onOpen,
  onEdit,
  onWish,
  onArchive,
  onRemove,
}: ItemCardProps) {
  const currency = item.currency ?? fallbackCurrency;
  const value = itemValue(item);
  // The card's figure: a manual value stays a worth estimate; otherwise the
  // number came from the paid price, so show the true total — tax included.
  const paid = paidWithTax(item);
  const costShown = item.value == null && paid > 0;
  const display = costShown ? paid : value;
  const photo = item.photos[0]?.url;
  const w = warrantyState(item, today);
  const badge = WARRANTY_BADGE[w];

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/60 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-700 hover:shadow-lg hover:shadow-slate-950/40 motion-reduce:hover:translate-y-0">
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={`View ${item.name}`}
        className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden bg-slate-950/60"
      >
        {photo ? (
          // Arbitrary user URLs aren't in next/image's allowlist, so use a plain img.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={item.name}
            // object-contain so the whole item is visible (no cropping); the
            // dark panel behind letterboxes odd aspect ratios cleanly.
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-700">
            <Package className="h-10 w-10" />
          </div>
        )}
        {item.photos.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-200 backdrop-blur">
            📷 {item.photos.length}
          </span>
        )}
        {badge && (
          <span
            className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur ${badge.cls}`}
          >
            {badge.label}
          </span>
        )}
        {item.lentTo && (
          <span className="absolute left-2 top-2 rounded-full bg-violet-500/25 px-2 py-0.5 text-[10px] font-medium text-violet-100 backdrop-blur">
            Lent · {item.lentTo}
          </span>
        )}
        {item.status === "returned" && (
          <span className="absolute left-2 top-2 rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-medium text-amber-100 backdrop-blur">
            🔙 Returned — not in totals
          </span>
        )}
        {item.origin && item.status !== "returned" && !item.lentTo && (
          <span className="absolute left-2 top-2 rounded-full bg-sky-500/25 px-2 py-0.5 text-[10px] font-medium text-sky-100 backdrop-blur">
            {item.origin === "rented" ? "🏷 Rented" : "🤲 Borrowed"}
            {item.borrowedFrom ? ` · ${item.borrowedFrom}` : ""}
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpen(item)}
            title={item.name}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-100 transition hover:text-blue-200"
          >
            {item.name}
          </button>
          {display > 0 && (
            <span
              title={costShown ? "Total paid (incl. tax)" : "Estimated value"}
              className="shrink-0 text-sm font-semibold tabular-nums text-emerald-300"
            >
              {formatMoney(display, currency)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {locationName && (
            <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-300">
              📍 {locationName}
            </span>
          )}
          {item.category && (
            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-200">
              {item.category}
            </span>
          )}
          {item.projectName && (
            <span
              className="max-w-full truncate rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-200"
              title={`Focus project: ${item.projectName}`}
            >
              🎯 {item.projectName}
            </span>
          )}
          {item.collection && (
            <span
              className="max-w-full truncate rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-medium text-teal-200"
              title={`Collection: ${item.collection}`}
            >
              🧰 {item.collection}
            </span>
          )}
          {item.disposition && (
            <span
              className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200"
              title="On the way out"
            >
              ✨ {DISPOSITIONS.find((d) => d.id === item.disposition)?.label ?? item.disposition}
            </span>
          )}
          {item.quantity > 1 && (
            <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-300 tabular-nums">
              ×{item.quantity}
            </span>
          )}
          {item.condition && (
            <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-400">
              {CONDITIONS.find((c) => c.id === item.condition)?.label ??
                item.condition}
            </span>
          )}
        </div>

        {item.links.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.links.slice(0, 2).map((l) => (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                title={l.url}
                className="max-w-full truncate rounded-full border border-blue-400/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-200 transition hover:border-blue-400/60 hover:text-blue-100"
              >
                🔗 {l.title}
              </a>
            ))}
            {item.links.length > 2 && (
              <span
                className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-400"
                title={item.links
                  .slice(2)
                  .map((l) => l.title)
                  .join(", ")}
              >
                +{item.links.length - 2}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-end gap-1 pt-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
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
  );
}

export default ItemCard;
