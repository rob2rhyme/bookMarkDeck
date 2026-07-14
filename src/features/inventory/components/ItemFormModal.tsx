"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/Modal";
import { X } from "@/components/icons";
import {
  CONDITIONS,
  type InventoryItem,
  type ItemCondition,
  type ItemLink,
} from "@/features/inventory/lib/types";
import {
  filterBookmarks,
  similarItems,
} from "@/features/inventory/lib/inventorySearch";
import {
  flattenTree,
  type LocationNode,
} from "@/features/inventory/hooks/useInventoryLocations";

type ItemFormModalProps = {
  open: boolean;
  item: InventoryItem | null; // the item to edit, or a blank one to create
  tree: LocationNode[];
  categorySuggestions: string[];
  focusProjects: string[]; // the user's Focus project labels (read-only)
  defaultCurrency: string;
  today: string; // YYYY-MM-DD
  bookmarks: ItemLink[]; // the user's bookmark library (read-only)
  existingItems: InventoryItem[]; // for the "already own this?" nudge
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
  maintenanceDate: string;
  condition: "" | ItemCondition;
  manufacturer: string;
  model: string;
  serial: string;
  retailer: string;
  tags: string;
  photoUrl: string;
  lentTo: string;
  dueDate: string;
  projectName: string;
  notes: string;
  links: ItemLink[];
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
    maintenanceDate: item.maintenanceDate ?? "",
    condition: item.condition ?? "",
    manufacturer: item.manufacturer ?? "",
    model: item.model ?? "",
    serial: item.serial ?? "",
    retailer: item.retailer ?? "",
    tags: item.tags.join(", "),
    photoUrl: item.photos[0]?.url ?? "",
    lentTo: item.lentTo ?? "",
    dueDate: item.dueDate ?? "",
    projectName: item.projectName ?? "",
    notes: item.notes ?? "",
    links: item.links ?? [],
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
  focusProjects,
  defaultCurrency,
  today,
  bookmarks,
  existingItems,
  onSave,
  onClose,
}: ItemFormModalProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");

  // Seed the form when it opens (or when the target item changes). New items
  // start with details folded away — a name is enough to save (quick add);
  // editing opens everything.
  useEffect(() => {
    if (open && item) {
      setDraft(toDraft(item, defaultCurrency));
      setShowDetails(Boolean(item.updatedAt || item.name));
      setLinkQuery("");
    }
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

  // "Do I already own this?" — a gentle nudge while naming a NEW item.
  const lookalikes = isNew ? similarItems(existingItems, draft.name) : [];
  const attachedIds = new Set(draft.links.map((l) => l.id));
  const linkResults = filterBookmarks(bookmarks, linkQuery).filter(
    (b) => !attachedIds.has(b.id)
  );

  const attachLink = (b: ItemLink) => {
    set("links", [...draft.links, b]);
    setLinkQuery("");
  };
  const detachLink = (id: string) =>
    set(
      "links",
      draft.links.filter((l) => l.id !== id)
    );

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
      maintenanceDate: trimmedOrUndef(draft.maintenanceDate),
      condition: draft.condition || undefined,
      manufacturer: trimmedOrUndef(draft.manufacturer),
      model: trimmedOrUndef(draft.model),
      serial: trimmedOrUndef(draft.serial),
      retailer: trimmedOrUndef(draft.retailer),
      tags: draft.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      links: draft.links,
      photos,
      lentTo,
      // Stamp a lend-out date the first time something is marked lent.
      lentDate: lentTo ? item.lentDate ?? stamp : null,
      dueDate: lentTo ? trimmedOrUndef(draft.dueDate) ?? null : null,
      projectName: trimmedOrUndef(draft.projectName),
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
          {isNew && (
            <span className="text-[11px] text-slate-500">
              A name is enough — fill the rest in later.
            </span>
          )}
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

        {lookalikes.length > 0 && (
          <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/90">
            Looks like you may already own this:{" "}
            {lookalikes.map((i, idx) => (
              <span key={i.id}>
                {idx > 0 && ", "}
                <strong>{i.name}</strong>
              </span>
            ))}
            <span className="text-amber-200/60"> — still adding is fine.</span>
          </p>
        )}

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
                  {`${"  ".repeat(l.depth)}${l.name}`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Links — the item's online life, picked from the bookmark library. */}
        <div>
          <span className={labelClass}>
            Links — manual, product page, warranty…
          </span>
          {draft.links.length > 0 && (
            <ul className="mb-1.5 flex flex-wrap gap-1.5">
              {draft.links.map((l) => (
                <li
                  key={l.id}
                  className="flex max-w-full items-center gap-1 rounded-full border border-blue-400/40 bg-blue-500/10 py-0.5 pl-2.5 pr-1 text-xs text-blue-200"
                >
                  <span className="truncate" title={l.url}>
                    🔗 {l.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => detachLink(l.id)}
                    aria-label={`Remove link ${l.title}`}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-blue-300/70 transition hover:text-blue-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {bookmarks.length === 0 ? (
            <p className="text-xs text-slate-500">
              No bookmarks yet — save some on the Bookmarks page, then attach
              them here.
            </p>
          ) : (
            <>
              <input
                type="text"
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                placeholder="Search your bookmarks to attach…"
                aria-label="Search bookmarks to attach"
                className={fieldClass}
              />
              {linkQuery.trim() && (
                <ul className="mt-1 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
                  {linkResults.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-slate-500">
                      No bookmarks match “{linkQuery.trim()}”.
                    </li>
                  ) : (
                    linkResults.map((b) => (
                      <li key={b.id}>
                        <button
                          type="button"
                          onClick={() => attachLink(b)}
                          className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition hover:bg-slate-800/60"
                        >
                          <span className="min-w-0 truncate text-sm text-slate-200">
                            {b.title}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                            {b.url}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </>
          )}
        </div>

        {!showDetails ? (
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            className="self-start text-xs font-medium text-blue-300 transition hover:text-blue-200"
          >
            ▸ Add details — value, warranty, serial, photo…
          </button>
        ) : (
          <>
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

            <div className="grid grid-cols-3 gap-3">
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
              <Field label="Maintenance due">
                <input
                  type="date"
                  value={draft.maintenanceDate}
                  onChange={(e) => set("maintenanceDate", e.target.value)}
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

            <Field label="Focus project">
              <input
                type="text"
                list="inventory-focus-projects"
                value={draft.projectName}
                onChange={(e) => set("projectName", e.target.value)}
                placeholder="Tie this to a Focus project…"
                className={fieldClass}
              />
              <datalist id="inventory-focus-projects">
                {focusProjects.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>

            <Field label="Photo URL">
              <input
                type="url"
                value={draft.photoUrl}
                onChange={(e) => set("photoUrl", e.target.value)}
                placeholder="https://…  (uploads land with the R2 pipeline — see roadmap)"
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
          </>
        )}

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
