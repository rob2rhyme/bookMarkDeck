"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/Modal";
import {
  CONDITIONS,
  type InventoryItem,
  type ItemCondition,
} from "@/features/inventory/lib/types";
import {
  flattenTree,
  type LocationNode,
} from "@/features/inventory/hooks/useInventoryLocations";

type ItemFormModalProps = {
  open: boolean;
  item: InventoryItem | null; // the item to edit, or a blank one to create
  tree: LocationNode[];
  categorySuggestions: string[];
  defaultCurrency: string;
  today: string; // YYYY-MM-DD
  onSave: (item: InventoryItem) => void;
  onClose: () => void;
};

type Draft = {
  name: string;
  category: string;
  locationId: string;
  quantity: string;
  value: string;
  price: string;
  currency: string;
  purchaseDate: string;
  warrantyExpiry: string;
  condition: "" | ItemCondition;
  manufacturer: string;
  model: string;
  serial: string;
  retailer: string;
  tags: string;
  photoUrl: string;
  lentTo: string;
  dueDate: string;
  notes: string;
};

function toDraft(item: InventoryItem, fallbackCurrency: string): Draft {
  return {
    name: item.name,
    category: item.category ?? "",
    locationId: item.locationId ?? "",
    quantity: String(item.quantity || 1),
    value: item.value != null ? String(item.value) : "",
    price: item.price != null ? String(item.price) : "",
    currency: item.currency ?? fallbackCurrency,
    purchaseDate: item.purchaseDate ?? "",
    warrantyExpiry: item.warrantyExpiry ?? "",
    condition: item.condition ?? "",
    manufacturer: item.manufacturer ?? "",
    model: item.model ?? "",
    serial: item.serial ?? "",
    retailer: item.retailer ?? "",
    tags: item.tags.join(", "),
    photoUrl: item.photos[0]?.url ?? "",
    lentTo: item.lentTo ?? "",
    dueDate: item.dueDate ?? "",
    notes: item.notes ?? "",
  };
}

const numOrUndef = (v: string): number | undefined => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};
const trimmedOrUndef = (v: string): string | undefined => (v.trim() ? v.trim() : undefined);

const fieldClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none";
const labelClass = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function ItemFormModal({
  open,
  item,
  tree,
  categorySuggestions,
  defaultCurrency,
  today,
  onSave,
  onClose,
}: ItemFormModalProps) {
  const [draft, setDraft] = useState<Draft | null>(null);

  // Seed the form when it opens (or when the target item changes).
  useEffect(() => {
    if (open && item) setDraft(toDraft(item, defaultCurrency));
    if (!open) setDraft(null);
  }, [open, item, defaultCurrency]);

  const flatLocations = useMemo(() => flattenTree(tree), [tree]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  if (!open || !item || !draft) return null;
  const isNew = !item.updatedAt && item.name === "";
  const canSave = draft.name.trim().length > 0;
  // `today` is set post-mount; guard the lend-date stamp in the unlikely early case.
  const stamp = today || new Date().toISOString().slice(0, 10);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const lentTo = trimmedOrUndef(draft.lentTo) ?? null;
    const photos = draft.photoUrl.trim()
      ? [{ id: item.photos[0]?.id ?? crypto.randomUUID(), url: draft.photoUrl.trim() }]
      : [];
    const next: InventoryItem = {
      ...item,
      name: draft.name.trim(),
      category: trimmedOrUndef(draft.category),
      locationId: draft.locationId || null,
      quantity: Math.max(1, Math.round(numOrUndef(draft.quantity) ?? 1)),
      value: numOrUndef(draft.value),
      price: numOrUndef(draft.price),
      currency: trimmedOrUndef(draft.currency) ?? defaultCurrency,
      purchaseDate: trimmedOrUndef(draft.purchaseDate),
      warrantyExpiry: trimmedOrUndef(draft.warrantyExpiry),
      condition: draft.condition || undefined,
      manufacturer: trimmedOrUndef(draft.manufacturer),
      model: trimmedOrUndef(draft.model),
      serial: trimmedOrUndef(draft.serial),
      retailer: trimmedOrUndef(draft.retailer),
      tags: draft.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      photos,
      lentTo,
      // Stamp a lend-out date the first time something is marked lent.
      lentDate: lentTo ? item.lentDate ?? stamp : null,
      dueDate: lentTo ? trimmedOrUndef(draft.dueDate) ?? null : null,
      notes: trimmedOrUndef(draft.notes),
    };
    onSave(next);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={isNew ? "Add item" : "Edit item"}
      panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-50">
            {isNew ? "Add item" : "Edit item"}
          </h2>
        </div>

        <Field label="Name">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Sony A7 IV"
            autoFocus
            className={fieldClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <input
              type="text"
              list="inventory-categories"
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="Electronics"
              className={fieldClass}
            />
            <datalist id="inventory-categories">
              {categorySuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Location">
            <select
              value={draft.locationId}
              onChange={(e) => set("locationId", e.target.value)}
              className={fieldClass}
            >
              <option value="">Unassigned</option>
              {flatLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {`${"  ".repeat(l.depth)}${l.name}`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantity">
            <input
              type="number"
              min={1}
              value={draft.quantity}
              onChange={(e) => set("quantity", e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Est. value">
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.value}
              onChange={(e) => set("value", e.target.value)}
              placeholder="0"
              className={fieldClass}
            />
          </Field>
          <Field label="Currency">
            <input
              type="text"
              value={draft.currency}
              onChange={(e) => set("currency", e.target.value.toUpperCase())}
              maxLength={3}
              className={fieldClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid (price)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="0"
              className={fieldClass}
            />
          </Field>
          <Field label="Condition">
            <select
              value={draft.condition}
              onChange={(e) => set("condition", e.target.value as Draft["condition"])}
              className={fieldClass}
            >
              <option value="">—</option>
              {CONDITIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase date">
            <input
              type="date"
              value={draft.purchaseDate}
              onChange={(e) => set("purchaseDate", e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Warranty expires">
            <input
              type="date"
              value={draft.warrantyExpiry}
              onChange={(e) => set("warrantyExpiry", e.target.value)}
              className={fieldClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Maker">
            <input
              type="text"
              value={draft.manufacturer}
              onChange={(e) => set("manufacturer", e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Model">
            <input
              type="text"
              value={draft.model}
              onChange={(e) => set("model", e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Serial">
            <input
              type="text"
              value={draft.serial}
              onChange={(e) => set("serial", e.target.value)}
              className={fieldClass}
            />
          </Field>
        </div>

        <Field label="Retailer">
          <input
            type="text"
            value={draft.retailer}
            onChange={(e) => set("retailer", e.target.value)}
            placeholder="Where you bought it"
            className={fieldClass}
          />
        </Field>

        <Field label="Tags (comma-separated)">
          <input
            type="text"
            value={draft.tags}
            onChange={(e) => set("tags", e.target.value)}
            placeholder="fragile, gift, work"
            className={fieldClass}
          />
        </Field>

        <Field label="Photo URL">
          <input
            type="url"
            value={draft.photoUrl}
            onChange={(e) => set("photoUrl", e.target.value)}
            placeholder="https://…  (uploads land with Firebase Storage — see roadmap)"
            className={fieldClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Lent to">
            <input
              type="text"
              value={draft.lentTo}
              onChange={(e) => set("lentTo", e.target.value)}
              placeholder="Nobody"
              className={fieldClass}
            />
          </Field>
          <Field label="Return by">
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
              disabled={!draft.lentTo.trim()}
              className={`${fieldClass} disabled:opacity-40`}
            />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            className={`${fieldClass} resize-y`}
          />
        </Field>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {isNew ? "Add item" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default ItemFormModal;
