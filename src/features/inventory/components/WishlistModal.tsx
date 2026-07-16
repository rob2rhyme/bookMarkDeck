"use client";

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { Plus, Trash2, X } from "@/components/icons";
import { BarcodeScanner } from "@/features/inventory/components/BarcodeScanner";
import {
  filterBookmarks,
  similarItems,
} from "@/features/inventory/lib/inventorySearch";
import type { ProductInfo } from "@/features/inventory/lib/productLookup";
import { formatMoney } from "@/features/inventory/lib/value";
import type {
  InventoryItem,
  ItemLink,
  WishlistItem,
} from "@/features/inventory/lib/types";

type WishlistModalProps = {
  open: boolean;
  items: WishlistItem[];
  ownedItems: InventoryItem[]; // for the "already own this?" nudge
  bookmarks: ItemLink[]; // library for the product-page link picker
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

export function WishlistModal({
  open,
  items,
  ownedItems,
  bookmarks,
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
  const [link, setLink] = useState<ItemLink | null>(null);
  const [linkQuery, setLinkQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<
    "idle" | "loading" | "found" | "none"
  >("idle");

  const reset = () => {
    setName("");
    setPrice("");
    setCategory("");
    setLink(null);
    setLinkQuery("");
    setBarcode("");
    setLookupStatus("idle");
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
  const linkResults = filterBookmarks(bookmarks, linkQuery).filter(
    (b) => b.id !== link?.id
  );

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const est = parseFloat(price);
    onUpsert({
      id: crypto.randomUUID(),
      name: name.trim(),
      estPrice: Number.isFinite(est) ? est : undefined,
      currency: defaultCurrency,
      category: category.trim() || undefined,
      link: link ?? undefined,
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
          <span className={labelClass}>Where to buy — link a bookmark</span>
          {link ? (
            <span className="mb-1 flex max-w-full items-center gap-1 rounded-full border border-blue-400/40 bg-blue-500/10 py-0.5 pl-2.5 pr-1 text-xs text-blue-200">
              <span className="truncate" title={link.url}>
                🔗 {link.title}
              </span>
              <button
                type="button"
                onClick={() => setLink(null)}
                aria-label="Remove link"
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-blue-300/70 transition hover:text-blue-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : bookmarks.length === 0 ? (
            <p className="text-xs text-slate-500">
              No bookmarks yet — save the product page on Bookmarks to link it.
            </p>
          ) : (
            <>
              <input
                type="text"
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                placeholder="Search your bookmarks…"
                aria-label="Search bookmarks"
                className={fieldClass}
              />
              {linkQuery.trim() && linkResults.length > 0 && (
                <ul className="mt-1 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
                  {linkResults.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setLink(b);
                          setLinkQuery("");
                        }}
                        className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition hover:bg-slate-800/60"
                      >
                        <span className="min-w-0 truncate text-sm text-slate-200">
                          {b.title}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
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
              className="group flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
            >
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
