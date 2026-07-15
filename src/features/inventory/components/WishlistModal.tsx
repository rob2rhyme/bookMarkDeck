"use client";

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { Plus, Trash2, X } from "@/components/icons";
import {
  filterBookmarks,
  similarItems,
} from "@/features/inventory/lib/inventorySearch";
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
  "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none";
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

  const reset = () => {
    setName("");
    setPrice("");
    setCategory("");
    setLink(null);
    setLinkQuery("");
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
      panelClassName="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <div className="flex items-center justify-between">
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
    </Modal>
  );
}

export default WishlistModal;
