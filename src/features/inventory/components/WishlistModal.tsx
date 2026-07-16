"use client";

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { Plus, Trash2, X } from "@/components/icons";
import { BarcodeScanner } from "@/features/inventory/components/BarcodeScanner";
import { PriceComparisonPanel } from "@/features/inventory/components/PriceComparisonPanel";
import { useItemPriceOffers } from "@/features/inventory/hooks/useItemPriceOffers";
import { similarItems } from "@/features/inventory/lib/inventorySearch";
import type { ProductInfo } from "@/features/inventory/lib/productLookup";
import { formatMoney } from "@/features/inventory/lib/value";
import type {
  InventoryItem,
  PriceLink,
  WishlistItem,
} from "@/features/inventory/lib/types";

type WishlistModalProps = {
  open: boolean;
  items: WishlistItem[];
  ownedItems: InventoryItem[]; // for the "already own this?" nudge
  categorySuggestions: string[];
  defaultCurrency: string;
  onUpsert: (w: WishlistItem) => void;
  onRemove: (id: string) => void;
  onGotIt: (w: WishlistItem) => void; // convert → My Stuff
  onClose: () => void;
};

const fieldClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none";
const labelClass = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500";

// A compare-link row while editing — price stays a string until save.
type DraftPriceLink = { id: string; store: string; url: string; price: string };

/** The same price comparison an item gets, for a wish: live offers by barcode
 *  (fetched only while expanded) over the wish's saved compare-links, measured
 *  against your estimate. */
function WishCompare({
  wish,
  fallbackCurrency,
}: {
  wish: WishlistItem;
  fallbackCurrency: string;
}) {
  const live = useItemPriceOffers(wish.barcode, true);
  return (
    <PriceComparisonPanel
      liveOffers={live.offers}
      loading={live.loading}
      manualLinks={wish.compareLinks ?? []}
      currency={wish.currency ?? fallbackCurrency}
      referencePrice={wish.estPrice}
      referenceLabel="your estimate"
    />
  );
}

export function WishlistModal({
  open,
  items,
  ownedItems,
  categorySuggestions,
  defaultCurrency,
  onUpsert,
  onRemove,
  onGotIt,
  onClose,
}: WishlistModalProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [barcode, setBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<
    "idle" | "loading" | "found" | "none"
  >("idle");
  const [compareLinks, setCompareLinks] = useState<DraftPriceLink[]>([]);
  // Which wish's price comparison is expanded (one at a time).
  const [compareOpenId, setCompareOpenId] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setPrice("");
    setCategory("");
    setBarcode("");
    setLookupStatus("idle");
    setCompareLinks([]);
  };

  // Same fast path as the add-item form: barcode → product lookup → prefill
  // whatever's still empty (your own typing is never overwritten).
  const fillEmptyFrom = (info: ProductInfo) => {
    const suggested =
      info.name ?? [info.brand, info.model].filter(Boolean).join(" ");
    if (!name.trim() && suggested) setName(suggested);
    if (!price.trim() && info.price != null) setPrice(String(info.price));
    if (!category.trim() && info.category) setCategory(info.category);
  };

  const runLookup = async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setLookupStatus("loading");
    try {
      const res = await fetch(
        `/api/inventory/product-lookup?code=${encodeURIComponent(code)}`
      );
      const data = (await res.json()) as { found?: boolean; product?: ProductInfo };
      if (data?.found && data.product) {
        fillEmptyFrom(data.product);
        setLookupStatus("found");
      } else {
        setLookupStatus("none");
      }
    } catch {
      setLookupStatus("none");
    }
  };

  const lookalikes = similarItems(ownedItems, name);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const est = parseFloat(price);
    const cleanedCompare: PriceLink[] = compareLinks
      .map((l) => {
        const p = parseFloat(l.price);
        return {
          id: l.id,
          store: l.store.trim(),
          url: l.url.trim(),
          price: Number.isFinite(p) ? p : undefined,
        };
      })
      .filter((l) => l.url !== "");
    onUpsert({
      id: crypto.randomUUID(),
      name: name.trim(),
      estPrice: Number.isFinite(est) ? est : undefined,
      currency: defaultCurrency,
      category: category.trim() || undefined,
      barcode: barcode.trim() || undefined,
      compareLinks: cleanedCompare.length ? cleanedCompare : undefined,
      createdAt: new Date().toISOString(),
    });
    reset();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      label="Wishlist"
      // Mobile: a tight full-screen sheet (same pattern as the add-item form);
      // sm+ keeps the exact centered card it always had.
      overlayClassName="inset-0 flex items-stretch justify-center sm:items-center sm:px-4 sm:py-[5vh]"
      panelClassName="flex w-full flex-col max-h-[100dvh] overflow-y-auto overflow-x-hidden bg-slate-900 p-4 shadow-2xl outline-none sm:block sm:max-w-md sm:max-h-[88vh] sm:rounded-2xl sm:border sm:border-slate-800 sm:p-6"
    >
      <div className="flex items-center justify-between max-sm:sticky max-sm:-top-4 max-sm:z-10 max-sm:-mx-4 max-sm:-mt-4 max-sm:border-b max-sm:border-slate-800/70 max-sm:bg-slate-900/95 max-sm:px-4 max-sm:pb-2.5 max-sm:pt-4 max-sm:backdrop-blur">
        <h2 className="text-lg font-semibold text-slate-50">Wishlist</h2>
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
        Things you want — with a checked-before-you-buy nudge if you may already
        own something like it. Got it? Move it into My Stuff in one tap.
      </p>

      <form onSubmit={add} className="mt-4 flex flex-col gap-2">
        {/* Scan-to-prefill — the add-item form's fast path, for wishes: a
            barcode look-up fills name / price / category you haven't typed. */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <span className={labelClass}>Scan a product — the fast way to wish</span>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={barcode}
              onChange={(e) => {
                setBarcode(e.target.value);
                if (lookupStatus !== "idle") setLookupStatus("idle");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runLookup(barcode);
                }
              }}
              placeholder="Barcode — scan or type…"
              aria-label="Barcode"
              className={fieldClass}
            />
            {barcode.trim() && (
              <button
                type="button"
                onClick={() => runLookup(barcode)}
                disabled={lookupStatus === "loading"}
                className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                {lookupStatus === "loading" ? "…" : "Look up"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
            >
              📷 Scan
            </button>
          </div>
          {lookupStatus !== "idle" && lookupStatus !== "loading" && (
            <p
              className={`mt-1.5 text-xs ${
                lookupStatus === "found" ? "text-emerald-300" : "text-slate-500"
              }`}
            >
              {lookupStatus === "found"
                ? "Filled in what we found — check and tweak."
                : "No match found — just type the name below."}
            </p>
          )}
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What do you want? e.g. Sony A7 IV"
          aria-label="Wishlist item name"
          className={fieldClass}
        />

        {lookalikes.length > 0 && (
          <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/90">
            You may already own:{" "}
            {lookalikes.map((i, idx) => (
              <span key={i.id}>
                {idx > 0 && ", "}
                <strong>{i.name}</strong>
              </span>
            ))}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelClass}>Est. price</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Category</span>
            <input
              type="text"
              list="wishlist-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Electronics"
              className={fieldClass}
            />
            <datalist id="wishlist-categories">
              {categorySuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className={labelClass}>Compare prices at other stores</span>
            <button
              type="button"
              onClick={() =>
                setCompareLinks((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), store: "", url: "", price: "" },
                ])
              }
              className="shrink-0 whitespace-nowrap rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-blue-400 hover:text-blue-300"
            >
              + Store
            </button>
          </div>
          {compareLinks.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Optional — add store links to compare before you buy. A scanned
              barcode also pulls live prices when available.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {compareLinks.map((l) => (
                <li
                  key={l.id}
                  className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/40 p-2"
                >
                  <input
                    type="text"
                    value={l.store}
                    onChange={(e) =>
                      setCompareLinks((prev) =>
                        prev.map((x) =>
                          x.id === l.id ? { ...x, store: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Store"
                    aria-label="Store name"
                    className={fieldClass}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.price}
                    onChange={(e) =>
                      setCompareLinks((prev) =>
                        prev.map((x) =>
                          x.id === l.id ? { ...x, price: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Price"
                    aria-label="Price at this store"
                    className={fieldClass}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCompareLinks((prev) => prev.filter((x) => x.id !== l.id))
                    }
                    aria-label="Remove store"
                    className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-red-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <input
                    type="url"
                    inputMode="url"
                    value={l.url}
                    onChange={(e) =>
                      setCompareLinks((prev) =>
                        prev.map((x) =>
                          x.id === l.id ? { ...x, url: e.target.value } : x
                        )
                      )
                    }
                    placeholder="https://…"
                    aria-label="Store URL"
                    className={`${fieldClass} col-span-3`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          disabled={!name.trim()}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add to wishlist
        </button>
      </form>

      <ul className="mt-5 flex flex-col gap-1.5">
        {items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-700/70 px-3 py-6 text-center text-sm text-slate-500">
            Nothing on your wishlist yet.
          </li>
        ) : (
          items.map((w) => (
            <li
              key={w.id}
              className="group rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-100">{w.name}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    {typeof w.estPrice === "number" && (
                      <span className="tabular-nums text-emerald-300/90">
                        {formatMoney(w.estPrice, w.currency ?? defaultCurrency)}
                      </span>
                    )}
                    {w.category && <span>{w.category}</span>}
                    {w.link && (
                      <a
                        href={w.link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-blue-300 transition hover:text-blue-200"
                      >
                        🔗 {w.link.title}
                      </a>
                    )}
                  </span>
                </div>
                {(w.barcode || (w.compareLinks?.length ?? 0) > 0) && (
                  <button
                    type="button"
                    onClick={() =>
                      setCompareOpenId((id) => (id === w.id ? null : w.id))
                    }
                    aria-expanded={compareOpenId === w.id}
                    title="Compare prices"
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                      compareOpenId === w.id
                        ? "border-blue-400 text-blue-300"
                        : "border-slate-700 text-slate-300 hover:border-blue-400 hover:text-blue-300"
                    }`}
                  >
                    ⚖ Compare
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onGotIt(w)}
                  title="Got it — move into My Stuff"
                  className="shrink-0 rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
                >
                  Got it
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(w.id)}
                  aria-label={`Remove ${w.name}`}
                  className="shrink-0 text-slate-600 transition hover:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {compareOpenId === w.id && (
                <WishCompare wish={w} fallbackCurrency={defaultCurrency} />
              )}
            </li>
          ))
        )}
      </ul>

      {scanning && (
        <BarcodeScanner
          onDetect={(code) => {
            setBarcode(code);
            setScanning(false);
            runLookup(code);
          }}
          onCancel={() => setScanning(false)}
        />
      )}
    </Modal>
  );
}

export default WishlistModal;
