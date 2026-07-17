"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { ExternalLink, Pencil, Share2, X } from "@/components/icons";
import { useToast } from "@/components/toast/ToastProvider";
import { docKindLabel } from "@/features/inventory/lib/documents";
import type {
  InventoryItem,
  InventoryLocation,
  ItemDoc,
} from "@/features/inventory/lib/types";
import {
  CONDITIONS,
  DISPOSITIONS,
  ITEM_STATUSES,
  READ_STATUSES,
  type ItemActivityType,
  type ItemStatus,
  type ReadStatus,
} from "@/features/inventory/lib/types";
import { buildItemShareText } from "@/features/inventory/lib/share";
import {
  activitySummary,
  lendingHistory,
  sortedActivity,
} from "@/features/inventory/lib/activity";
import { PriceComparisonPanel } from "@/features/inventory/components/PriceComparisonPanel";
import { useItemPriceOffers } from "@/features/inventory/hooks/useItemPriceOffers";
import { locationPathsById } from "@/features/inventory/lib/inventorySearch";
import {
  daysUntil,
  effectiveUseBy,
  formatMoney,
  itemValue,
  paidWithTax,
  taxAmount,
  warrantyState,
} from "@/features/inventory/lib/value";

type ItemDetailModalProps = {
  open: boolean;
  item: InventoryItem | null;
  locations: InventoryLocation[];
  fallbackCurrency: string;
  today: string;
  canAttach: boolean;
  onFetchDocs: (itemId: string) => Promise<ItemDoc[]>;
  onEdit: (item: InventoryItem) => void;
  onMarkUsed: (id: string) => void;
  onSetStatus: (id: string, status: ItemStatus) => void;
  onReturn: (id: string, condition?: InventoryItem["condition"]) => void;
  onSetRead: (id: string, status: ReadStatus | undefined) => void;
  onClose: () => void;
};

const ACTIVITY_META: Record<ItemActivityType, { icon: string; label: string }> = {
  acquired: { icon: "🆕", label: "Acquired" },
  used: { icon: "✨", label: "Used" },
  lent: { icon: "🤝", label: "Lent out" },
  returned: { icon: "↩️", label: "Returned" },
  refunded: { icon: "🔙", label: "Returned it" }, // store refund or gave a borrow back
  relocated: { icon: "📦", label: "Moved" },
  misplaced: { icon: "🫥", label: "Misplaced" },
  lost: { icon: "🚫", label: "Lost" },
  found: { icon: "🔎", label: "Found" },
  note: { icon: "📝", label: "Note" },
};

const conditionLabel = (c?: string) =>
  c ? CONDITIONS.find((x) => x.id === c)?.label ?? c : undefined;

/** Compact "how long ago" from an ISO timestamp relative to nowMs. */
function relTime(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = Math.round((nowMs - t) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

type LightboxImage = { url: string; caption: string };

/** Full-bleed image viewer layered above the detail dialog. ‹ › page through;
 *  ✕ or backdrop closes just the lightbox. */
function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: LightboxImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const img = images[index];
  if (!img) return null;
  const many = images.length > 1;
  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="animate-bd-fade-in fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.url}
        alt={img.caption}
        className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
      />
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-3 py-1 text-xs text-slate-300">
        {img.caption}
        {many && (
          <span className="ml-1.5 tabular-nums text-slate-500">
            {index + 1}/{images.length}
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/80 text-slate-200 transition hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
      {many && (
        <>
          <button
            type="button"
            onClick={() => onIndex((index - 1 + images.length) % images.length)}
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/80 px-3 py-2 text-lg text-slate-200 transition hover:text-white"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onIndex((index + 1) % images.length)}
            aria-label="Next photo"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/80 px-3 py-2 text-lg text-slate-200 transition hover:text-white"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

function Chip({ children, cls }: { children: React.ReactNode; cls?: string }) {
  return (
    <span
      className={`max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${
        cls ?? "bg-slate-800/80 text-slate-300"
      }`}
    >
      {children}
    </span>
  );
}

function FactRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-800/50 py-1.5 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right text-slate-200">{value}</span>
    </div>
  );
}

/** Read-only item view: photo carousel + lightbox, the facts, links, notes,
 *  and attachments — with one Edit button into the form. */
export function ItemDetailModal({
  open,
  item,
  locations,
  fallbackCurrency,
  today,
  canAttach,
  onFetchDocs,
  onEdit,
  onMarkUsed,
  onSetStatus,
  onReturn,
  onSetRead,
  onClose,
}: ItemDetailModalProps) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightbox, setLightbox] = useState<{
    images: LightboxImage[];
    index: number;
  } | null>(null);
  const [docs, setDocs] = useState<ItemDoc[]>([]);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const { toast } = useToast();
  // Live competitor prices (by barcode); manual compare-links are the fallback.
  const priceOffers = useItemPriceOffers(item?.barcode, open);

  const shareItem = async (target: InventoryItem) => {
    const appUrl =
      typeof window !== "undefined" ? window.location.origin : undefined;
    const text = buildItemShareText(target, appUrl);
    const data: ShareData = {
      title: target.name,
      text,
      ...(target.storeUrl ? { url: target.storeUrl } : {}),
    };
    // Native share sheet (Messages, WhatsApp, socials…) on supported devices.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // User dismissed the sheet, or it's unavailable — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied — paste into Messages, WhatsApp, or a post.", {
        variant: "success",
      });
    } catch {
      toast("Couldn't share on this device.", { variant: "error" });
    }
  };

  useEffect(() => {
    if (!open) return;
    setPhotoIdx(0);
    setLightbox(null);
    setDocs([]);
    setShowAllActivity(false);
    if (item && canAttach && item.updatedAt) {
      let cancelled = false;
      onFetchDocs(item.id)
        .then((list) => {
          if (!cancelled) setDocs(list);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [open, item, canAttach, onFetchDocs]);

  if (!open || !item) return null;

  const currency = item.currency ?? fallbackCurrency;
  const value = itemValue(item);
  const tax = taxAmount(item);
  const useBy = effectiveUseBy(item);
  const useByDays = useBy ? daysUntil(useBy, today) : null;
  const nowMs = Date.now();
  const status: ItemStatus =
    item.status ?? (item.lentTo?.trim() ? "lent" : "have");
  const summary = activitySummary(item, nowMs);
  const loans = lendingHistory(item, nowMs);
  const timeline = sortedActivity(item).slice(-12).reverse();
  const photos = item.photos ?? [];
  const photo = photos[Math.min(photoIdx, Math.max(0, photos.length - 1))];
  const path = item.locationId
    ? locationPathsById(locations)[item.locationId] ?? []
    : [];
  const wState = warrantyState(item, today);
  const wDays = item.warrantyExpiry ? daysUntil(item.warrantyExpiry, today) : null;
  const photoImages: LightboxImage[] = photos.map((p, i) => ({
    url: p.url,
    caption: photos.length > 1 ? `${item.name} — photo ${i + 1}` : item.name,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={item.name}
      // Mobile: a full-screen sheet (same family as the add-item form and
      // Wishlist); sm+ keeps the exact centered max-w-lg card it always had.
      overlayClassName="inset-0 flex items-stretch justify-center sm:items-center sm:px-4 sm:py-[5vh]"
      panelClassName="flex w-full flex-col max-h-[100dvh] overflow-y-auto overflow-x-hidden bg-slate-900 p-4 shadow-2xl outline-none sm:block sm:max-w-lg sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-slate-800 sm:p-6"
    >
      {/* Mobile stacks the header (actions row, then the title full-width and
          clamped to two lines) — side-by-side, the buttons squeezed a long
          name into a one-word-per-line column. sm+ keeps the single row. */}
      <div className="sticky -top-4 z-20 -mx-4 -mt-4 mb-1 flex flex-col-reverse gap-2 border-b border-slate-800/70 bg-slate-900/95 px-4 pb-2.5 pt-4 backdrop-blur sm:-top-6 sm:-mx-6 sm:-mt-6 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:rounded-t-2xl sm:px-6 sm:pb-3 sm:pt-6">
        <h2
          title={item.name}
          className="min-w-0 text-base font-semibold text-slate-50 max-sm:line-clamp-2 sm:flex-1 sm:text-lg"
        >
          {item.name}
        </h2>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => shareItem(item)}
            aria-label={`Share ${item.name}`}
            className="flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
          >
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {photo && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setLightbox({ images: photoImages, index: photoIdx })}
            aria-label="View photo full size"
            className="block w-full overflow-hidden rounded-xl border border-slate-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={item.name}
              // object-contain so the whole item shows; the dark panel behind
              // letterboxes tall/wide photos instead of cropping them.
              className="aspect-[4/3] w-full bg-slate-950/60 object-contain transition hover:opacity-90"
            />
          </button>
          {photos.length > 1 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setPhotoIdx(i)}
                    aria-label={`Show photo ${i + 1}`}
                    aria-pressed={i === photoIdx}
                    className={`block overflow-hidden rounded-lg border ${
                      i === photoIdx ? "border-blue-400" : "border-slate-700"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-12 w-12 object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {value > 0 && (
          <Chip cls="bg-emerald-500/15 text-emerald-300">
            {formatMoney(value, currency)}
          </Chip>
        )}
        <Chip>📍 {path.length > 0 ? path.join(" → ") : "Unassigned"}</Chip>
        {item.category && <Chip cls="bg-blue-500/15 text-blue-200">{item.category}</Chip>}
        {item.quantity > 1 && <Chip>×{item.quantity}</Chip>}
        {item.condition && (
          <Chip>
            {CONDITIONS.find((c) => c.id === item.condition)?.label ??
              item.condition}
          </Chip>
        )}
        {item.inBox === true && <Chip>📦 In box</Chip>}
        {item.inBox === false && <Chip>📭 Unboxed</Chip>}
        {item.collection && (
          <Chip cls="bg-teal-500/15 text-teal-200">🧰 {item.collection}</Chip>
        )}
        {item.projectName && (
          <Chip cls="bg-indigo-500/15 text-indigo-200">🎯 {item.projectName}</Chip>
        )}
        {item.disposition && (
          <Chip cls="bg-amber-500/15 text-amber-200">
            ✨ {DISPOSITIONS.find((d) => d.id === item.disposition)?.label ?? item.disposition}
          </Chip>
        )}
        {item.lentTo && (
          <Chip cls="bg-violet-500/25 text-violet-100">
            Lent · {item.lentTo}
            {item.dueDate ? ` · due ${item.dueDate}` : ""}
          </Chip>
        )}
        {item.archived && <Chip>archived</Chip>}
      </div>

      {/* Status + quick actions + at-a-glance history */}
      <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Status
          </span>
          {status === "lent" ? (
            <>
              <span className="rounded-full bg-violet-500/25 px-2.5 py-1 text-xs font-medium text-violet-100">
                🤝 Lent to {item.lentTo}
                {item.dueDate ? ` · due ${item.dueDate}` : ""}
              </span>
              <button
                type="button"
                onClick={() => onReturn(item.id, item.condition)}
                className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
              >
                ↩️ Mark returned
              </button>
            </>
          ) : (
            (["have", "misplaced", "lost", "returned"] as ItemStatus[]).map((id) => {
              const s = ITEM_STATUSES.find((x) => x.id === id)!;
              const on = status === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSetStatus(item.id, id)}
                  aria-pressed={on}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    on
                      ? "bg-blue-600 text-white"
                      : "border border-slate-700 text-slate-300 hover:border-blue-400 hover:text-blue-200"
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              );
            })
          )}
          <button
            type="button"
            onClick={() => onMarkUsed(item.id)}
            className="ml-auto rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-200"
          >
            ✨ Used today
          </button>
        </div>
        {(summary.possessionDays != null ||
          summary.uses > 0 ||
          summary.lends > 0 ||
          summary.relocations > 0) && (
          <p className="mt-2 text-[11px] text-slate-500">
            {summary.possessionDays != null &&
              `In your care ${summary.possessionDays}d`}
            {summary.uses > 0 &&
              ` · used ${summary.uses}×${
                summary.lastUsed
                  ? ` (last ${relTime(summary.lastUsed, nowMs)})`
                  : ""
              }`}
            {summary.lends > 0 && ` · lent ${summary.lends}×`}
            {summary.relocations > 0 && ` · moved ${summary.relocations}×`}
          </p>
        )}
      </div>

      <div className="mt-3">
        <FactRow
          label="Warranty"
          value={
            item.warrantyExpiry || item.warrantyYears || item.warrantyCost ? (
              <span
                className={
                  wState === "expired"
                    ? "text-red-300"
                    : wState === "soon"
                      ? "text-amber-300"
                      : undefined
                }
              >
                {item.warrantyExpiry}
                {item.warrantyExpiry &&
                  wDays !== null &&
                  (wDays < 0 ? ` (ended ${Math.abs(wDays)}d ago)` : ` (${wDays}d left)`)}
                {item.warrantyYears
                  ? `${item.warrantyExpiry ? " · " : ""}${item.warrantyYears}-yr plan`
                  : ""}
                {item.warrantyCost
                  ? ` (${formatMoney(item.warrantyCost, currency)})`
                  : ""}
              </span>
            ) : undefined
          }
        />
        {item.kind === "book" && <FactRow label="Author" value={item.author} />}
        {item.kind === "book" && (
          <FactRow
            label="Read"
            value={
              <span className="flex flex-wrap justify-end gap-1">
                {READ_STATUSES.map((r) => {
                  const on = item.readStatus === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onSetRead(item.id, on ? undefined : r.id)}
                      aria-pressed={on}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
                        on
                          ? "bg-blue-600 text-white"
                          : "border border-slate-700 text-slate-300 hover:border-blue-400 hover:text-blue-200"
                      }`}
                    >
                      {r.icon} {r.label}
                    </button>
                  );
                })}
              </span>
            }
          />
        )}
        {useBy && (
          <FactRow
            label="Use by"
            value={
              <span
                className={
                  useByDays !== null && useByDays < 0
                    ? "text-red-300"
                    : useByDays !== null && useByDays <= 14
                      ? "text-amber-300"
                      : undefined
                }
              >
                {useBy}
                {useByDays !== null &&
                  (useByDays < 0
                    ? ` (${Math.abs(useByDays)}d past)`
                    : ` (${useByDays}d left)`)}
              </span>
            }
          />
        )}
        {item.kind === "selfcare" && item.openedDate && (
          <FactRow
            label="Opened"
            value={`${item.openedDate}${item.paoMonths ? ` · PAO ${item.paoMonths}mo` : ""}`}
          />
        )}
        {item.kind === "clothing" && <FactRow label="Size" value={item.size} />}
        {item.origin && (
          <FactRow
            label={item.origin === "rented" ? "Rented from" : "Borrowed from"}
            value={[
              item.borrowedFrom || "—",
              item.borrowReturnBy ? `· return by ${item.borrowReturnBy}` : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        )}
        <FactRow label="Next upkeep" value={item.maintenanceDate} />
        <FactRow label="Purchased" value={item.purchaseDate} />
        <FactRow
          label="Paid"
          value={
            item.price != null || item.warrantyCost != null
              ? tax > 0 || (item.warrantyCost ?? 0) > 0
                ? // Subtotal (price × qty), warranty plan, tax — the arithmetic
                  // reads true for multi-quantity lines.
                  [
                    formatMoney(
                      (item.price ?? 0) * Math.max(1, item.quantity || 1),
                      currency
                    ),
                    item.warrantyCost
                      ? `${formatMoney(item.warrantyCost, currency)} warranty`
                      : null,
                    tax > 0 ? `${formatMoney(tax, currency)} tax` : null,
                  ]
                    .filter(Boolean)
                    .join(" + ") + ` = ${formatMoney(paidWithTax(item), currency)}`
                : formatMoney(item.price ?? 0, currency)
              : undefined
          }
        />
        <FactRow label="Retailer" value={item.retailer} />
        {item.storeUrl && (
          <div className="flex items-baseline justify-between gap-3 border-b border-slate-800/50 py-1.5 text-sm">
            <span className="shrink-0 text-slate-500">Store</span>
            <a
              href={item.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={item.storeUrl}
              className="inline-flex min-w-0 items-center gap-1 truncate text-right font-medium text-blue-300 transition hover:text-blue-200"
            >
              <span className="truncate">View in store</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          </div>
        )}
        <FactRow label="Maker" value={item.manufacturer} />
        <FactRow label="Model" value={item.model} />
        <FactRow label="Serial" value={item.serial} />
        <FactRow label="Barcode" value={item.barcode} />
        <FactRow
          label="Tags"
          value={item.tags.length > 0 ? item.tags.join(", ") : undefined}
        />
      </div>

      {item.links.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Links
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {item.links.map((l) => (
              <li key={l.id}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={l.url}
                  className="block max-w-full truncate rounded-full border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-200 transition hover:border-blue-400/60 hover:text-blue-100"
                >
                  🔗 {l.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PriceComparisonPanel
        liveOffers={priceOffers.offers}
        loading={priceOffers.loading}
        manualLinks={item.compareLinks ?? []}
        currency={currency}
        referencePrice={item.price}
        referenceLabel="what you paid"
      />

      {loans.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Lending history
          </p>
          <ul className="flex flex-col gap-1.5">
            {loans.map((l, i) => (
              <li
                key={`${l.lentAt}-${i}`}
                className="rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-slate-200">
                    🤝 {l.to || "Someone"}
                  </span>
                  <span className="shrink-0 text-slate-500">
                    {l.days != null
                      ? l.returnedAt
                        ? `${l.days}d`
                        : `out ${l.days}d`
                      : ""}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {l.lentAt.slice(0, 10)} →{" "}
                  {l.returnedAt ? l.returnedAt.slice(0, 10) : "not returned"}
                  {(l.conditionOut || l.conditionIn) &&
                    ` · ${conditionLabel(l.conditionOut) ?? "—"} → ${
                      conditionLabel(l.conditionIn) ?? "—"
                    }`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {timeline.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Activity
          </p>
          <ul className="flex flex-col gap-1">
            {(showAllActivity ? timeline : timeline.slice(0, 4)).map((a) => {
              const meta = ACTIVITY_META[a.type];
              const detail =
                a.type === "lent"
                  ? a.to
                    ? `to ${a.to}`
                    : ""
                  : a.type === "relocated"
                    ? [a.fromLoc, a.toLoc].filter(Boolean).join(" → ")
                    : a.note ?? "";
              return (
                <li key={a.id} className="flex items-center gap-2 text-xs">
                  <span aria-hidden>{meta.icon}</span>
                  <span className="shrink-0 text-slate-300">{meta.label}</span>
                  {detail && (
                    <span className="min-w-0 truncate text-slate-500">{detail}</span>
                  )}
                  {a.condition && (
                    <span className="shrink-0 text-slate-600">
                      ({conditionLabel(a.condition)})
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-slate-600">
                    {relTime(a.at, nowMs)}
                  </span>
                </li>
              );
            })}
          </ul>
          {timeline.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllActivity((v) => !v)}
              className="mt-1.5 text-[11px] font-medium text-slate-500 transition hover:text-slate-300"
            >
              {showAllActivity
                ? "Show less"
                : `Show all activity (${timeline.length})`}
            </button>
          )}
        </div>
      )}

      {item.notes && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Notes
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-300">
            {item.notes}
          </p>
        </div>
      )}

      {docs.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Receipts &amp; documents
          </p>
          <ul className="flex flex-wrap gap-2">
            {docs.map((d, i) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() =>
                    setLightbox({
                      images: docs.map((x) => ({
                        url: x.data,
                        caption: `${x.name} · ${docKindLabel(x.kind)}`,
                      })),
                      index: i,
                    })
                  }
                  className="block overflow-hidden rounded-lg border border-slate-700 transition hover:border-blue-400"
                  aria-label={`View ${d.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.data} alt={d.name} className="h-14 w-14 object-cover" />
                  <span className="block max-w-14 truncate px-1 text-center text-[9px] text-slate-400">
                    {d.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndex={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))}
          onClose={() => setLightbox(null)}
        />
      )}
    </Modal>
  );
}

export default ItemDetailModal;
