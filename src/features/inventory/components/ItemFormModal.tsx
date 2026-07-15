"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { ExternalLink, X } from "@/components/icons";
import {
  CONDITIONS,
  DISPOSITIONS,
  DOC_KINDS,
  type InventoryItem,
  type ItemCondition,
  type ItemDisposition,
  type ItemDoc,
  type ItemDocKind,
  type ItemLink,
  type ItemPhoto,
} from "@/features/inventory/lib/types";
import { docKindLabel, suggestDocName } from "@/features/inventory/lib/documents";
import {
  filterBookmarks,
  similarItems,
} from "@/features/inventory/lib/inventorySearch";
import {
  flattenTree,
  type LocationNode,
} from "@/features/inventory/hooks/useInventoryLocations";
import { BarcodeScanner } from "@/features/inventory/components/BarcodeScanner";
import type { ProductInfo } from "@/features/inventory/lib/productLookup";
import { compressImageFile, dataUrlToBlob } from "@/features/inventory/lib/image";
import {
  deleteInventoryObjects,
  uploadInventoryPhoto,
} from "@/features/inventory/lib/uploadPhoto";
import { runLabelOcr, runReceiptOcr } from "@/features/inventory/lib/ocrEngine";

type ItemFormModalProps = {
  open: boolean;
  item: InventoryItem | null; // the item to edit, or a blank one to create
  tree: LocationNode[];
  categorySuggestions: string[];
  focusProjects: string[]; // the user's Focus project labels (read-only)
  collections: string[]; // existing kit/collection names (for the picker)
  defaultCurrency: string;
  today: string; // YYYY-MM-DD
  bookmarks: ItemLink[]; // the user's bookmark library (read-only)
  existingItems: InventoryItem[]; // for the "already own this?" nudge
  canAttach: boolean; // synced → attachments (subcollection) available
  onFetchDocs: (itemId: string) => Promise<ItemDoc[]>;
  onAddDoc: (d: ItemDoc) => Promise<void>;
  onRemoveDoc: (docId: string) => Promise<void>;
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
  barcode: string;
  retailer: string;
  tags: string;
  photos: ItemPhoto[]; // full list — first photo is the card cover
  lentTo: string;
  dueDate: string;
  projectName: string;
  collection: string;
  disposition: "" | ItemDisposition;
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
    barcode: item.barcode ?? "",
    retailer: item.retailer ?? "",
    tags: item.tags.join(", "),
    photos: item.photos ?? [],
    lentTo: item.lentTo ?? "",
    dueDate: item.dueDate ?? "",
    projectName: item.projectName ?? "",
    collection: item.collection ?? "",
    disposition: item.disposition ?? "",
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
  collections,
  defaultCurrency,
  today,
  bookmarks,
  existingItems,
  canAttach,
  onFetchDocs,
  onAddDoc,
  onRemoveDoc,
  onSave,
  onClose,
}: ItemFormModalProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<
    "idle" | "loading" | "found" | "none"
  >("idle");
  const [compressing, setCompressing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [docs, setDocs] = useState<ItemDoc[]>([]);
  // R2 objects uploaded in THIS editing session that no saved record points at
  // yet. Anything still here when the modal closes (cancel, or replaced before
  // save) is swept from the bucket — the orphan-control half of the R2 path.
  const sessionUploadsRef = useRef<Set<string>>(new Set());
  // Monotonic id for the CURRENT editing session. In-flight async work
  // (lookup, OCR, photo compress+upload, attachment add) captures it and bails
  // if the modal was closed/reopened meanwhile — otherwise a slow promise from
  // item A's session would land in item B's draft (or leak an R2 object).
  const sessionIdRef = useRef(0);
  const [docsLoading, setDocsLoading] = useState(false);
  const [addingDoc, setAddingDoc] = useState(false);
  const [docKind, setDocKind] = useState<ItemDocKind>("receipt");
  const [docError, setDocError] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<
    "idle" | "scanning" | "done" | "none" | "error"
  >("idle");
  const [labelStatus, setLabelStatus] = useState<
    "idle" | "scanning" | "done" | "none" | "error"
  >("idle");

  // Seed the form when it opens (or when the target item changes). New items
  // start with details folded away — a name is enough to save (quick add);
  // editing opens everything.
  useEffect(() => {
    if (open && item) {
      setDraft(toDraft(item, defaultCurrency));
      setShowDetails(Boolean(item.updatedAt || item.name));
      setLinkQuery("");
      setScanning(false);
      setLookupStatus("idle");
      setCompressing(false);
      setPhotoError(null);
      setDocs([]);
      setDocError(null);
      setAddingDoc(false);
      setDocKind("receipt");
      setOcrStatus("idle");
      setLabelStatus("idle");
      setPhotoUrlInput("");
      sessionUploadsRef.current.clear();
    }
    if (!open) setDraft(null);
    // Any open/close/item change starts a new session; stale async work bails.
    sessionIdRef.current += 1;
  }, [open, item, defaultCurrency]);

  // Load an existing item's attachments on open (lazy — never in the item list).
  useEffect(() => {
    if (!open || !item || !canAttach || !item.updatedAt) return;
    let cancelled = false;
    setDocsLoading(true);
    onFetchDocs(item.id)
      .then((list) => {
        if (!cancelled) setDocs(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, canAttach]);

  const flatLocations = useMemo(() => flattenTree(tree), [tree]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  // Prefill only the fields the user hasn't already filled — a lookup never
  // clobbers your own entries.
  const fillEmptyFrom = (info: ProductInfo) => {
    setShowDetails(true);
    setDraft((d) => {
      if (!d) return d;
      const keep = (cur: string, next?: string) => (cur.trim() ? cur : next ?? cur);
      return {
        ...d,
        name: keep(d.name, info.name),
        category: keep(d.category, info.category),
        manufacturer: keep(d.manufacturer, info.brand),
        model: keep(d.model, info.model),
        price: d.price.trim() ? d.price : info.price != null ? String(info.price) : d.price,
        photos:
          d.photos.length === 0 && info.imageUrl
            ? [{ id: crypto.randomUUID(), url: info.imageUrl }]
            : d.photos,
      };
    });
  };

  const runLookup = async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const sid = sessionIdRef.current;
    setLookupStatus("loading");
    try {
      const res = await fetch(
        `/api/inventory/product-lookup?code=${encodeURIComponent(code)}`
      );
      const data = (await res.json()) as { found?: boolean; product?: ProductInfo };
      if (sid !== sessionIdRef.current) return; // modal moved on
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

  const closeAndSweep = () => {
    deleteInventoryObjects([...sessionUploadsRef.current]);
    sessionUploadsRef.current.clear();
    onClose();
  };

  // Multi-photo caps. R2 photos are just keys on the doc, so 8 is plenty; when
  // R2 is off each photo is a data: URL living ON the Firestore item doc
  // (1 MiB cap), so hold data:-URL photos to 3 AND a total string budget —
  // one boundary-size photo could otherwise push the doc past the cap and the
  // whole save would be rejected. Honest, not faked.
  const MAX_PHOTOS = 8;
  const MAX_DATA_PHOTOS = 3;
  const MAX_DATA_BYTES = 700_000; // headroom under 1 MiB for the rest of the doc

  // Camera capture / file pick → compress client-side → upload to R2 when
  // configured; otherwise keep the compressed data: URL. Appends to the list —
  // the first photo is the card cover.
  const onPickPhoto = async (file: File | undefined) => {
    if (!file || !item || !draft) return;
    setPhotoError(null);
    if (draft.photos.length >= MAX_PHOTOS) {
      setPhotoError(`Up to ${MAX_PHOTOS} photos per item.`);
      return;
    }
    const sid = sessionIdRef.current;
    setCompressing(true);
    try {
      const { dataUrl, mime, w, h } = await compressImageFile(file);
      const uploaded = await uploadInventoryPhoto(dataUrlToBlob(dataUrl), mime, item.id);
      if (sid !== sessionIdRef.current) {
        // Modal closed/switched items while we worked: never touch the new
        // session's draft, and don't strand the object we just uploaded.
        if (uploaded) deleteInventoryObjects([uploaded.path]);
        return;
      }
      if (uploaded) {
        sessionUploadsRef.current.add(uploaded.path);
        // Functional append — the draft may have moved while we awaited.
        setDraft((d) =>
          d
            ? {
                ...d,
                photos: [
                  ...d.photos,
                  { id: crypto.randomUUID(), url: uploaded.url, path: uploaded.path, w, h },
                ],
              }
            : d
        );
      } else {
        const dataPhotos = draft.photos.filter((p) => p.url.startsWith("data:"));
        const dataBytes = dataPhotos.reduce((s, p) => s + p.url.length, 0);
        if (
          dataPhotos.length >= MAX_DATA_PHOTOS ||
          dataBytes + dataUrl.length > MAX_DATA_BYTES
        ) {
          setPhotoError(
            dataPhotos.length >= MAX_DATA_PHOTOS
              ? `Up to ${MAX_DATA_PHOTOS} photos until cloud photo storage (R2) is set up — see the roadmap.`
              : "Not enough room to store this photo on the item without cloud photo storage (R2) — try a smaller photo or set up R2."
          );
          return;
        }
        setDraft((d) =>
          d
            ? {
                ...d,
                photos: [...d.photos, { id: crypto.randomUUID(), url: dataUrl, w, h }],
              }
            : d
        );
      }
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Couldn't process that image.");
    } finally {
      setCompressing(false);
    }
  };

  const removePhoto = (id: string) => {
    if (!draft) return;
    // The R2 object (if any) is swept on save/close — never immediately, so
    // cancelling the edit can't lose a saved photo's object.
    set(
      "photos",
      draft.photos.filter((p) => p.id !== id)
    );
  };

  // On-device receipt OCR (beta): read a receipt and prefill the empty
  // retailer / purchase date / price. Nothing is uploaded; the image isn't kept.
  const scanReceipt = async (file: File | undefined) => {
    if (!file) return;
    const sid = sessionIdRef.current;
    setOcrStatus("scanning");
    try {
      const { dataUrl } = await compressImageFile(file, { maxEdge: 1600, quality: 0.7 });
      const f = await runReceiptOcr(dataUrl);
      if (sid !== sessionIdRef.current) return; // modal moved on
      const got = Boolean(f.merchant || f.date || f.total != null);
      setDraft((d) =>
        d
          ? {
              ...d,
              retailer: d.retailer.trim() ? d.retailer : f.merchant ?? d.retailer,
              purchaseDate: d.purchaseDate.trim()
                ? d.purchaseDate
                : f.date ?? d.purchaseDate,
              price: d.price.trim()
                ? d.price
                : f.total != null
                  ? String(f.total)
                  : d.price,
            }
          : d
      );
      if (got) setShowDetails(true);
      setOcrStatus(got ? "done" : "none");
    } catch {
      setOcrStatus("error");
    }
  };

  // On-device label OCR: read the text off a product / its box and suggest the
  // name (and brand → manufacturer) into empty fields. Nothing is uploaded.
  const scanLabel = async (file: File | undefined) => {
    if (!file) return;
    const sid = sessionIdRef.current;
    setLabelStatus("scanning");
    try {
      const { dataUrl } = await compressImageFile(file, { maxEdge: 1600, quality: 0.7 });
      const f = await runLabelOcr(dataUrl);
      if (sid !== sessionIdRef.current) return; // modal moved on
      const got = Boolean(f.name || f.brand);
      setDraft((d) =>
        d
          ? {
              ...d,
              name: d.name.trim() ? d.name : f.name ?? d.name,
              manufacturer: d.manufacturer.trim()
                ? d.manufacturer
                : f.brand ?? d.manufacturer,
            }
          : d
      );
      setLabelStatus(got ? "done" : "none");
    } catch {
      setLabelStatus("error");
    }
  };

  const addDoc = async (file: File | undefined) => {
    if (!file || !item) return;
    const sid = sessionIdRef.current;
    setDocError(null);
    setAddingDoc(true);
    let uploadedPath: string | undefined;
    try {
      const { dataUrl, mime, w, h } = await compressImageFile(file, {
        maxEdge: 1500,
        quality: 0.6,
      });
      // Same R2-or-data:-URL dual path as photos — attachments share the
      // presign route; the doc row stays the only pointer to the object.
      const uploaded = await uploadInventoryPhoto(
        dataUrlToBlob(dataUrl),
        mime,
        item.id
      );
      uploadedPath = uploaded?.path;
      if (sid !== sessionIdRef.current) {
        // Modal closed/switched items mid-flight — don't persist a row the
        // user walked away from, and don't strand the uploaded object.
        if (uploadedPath) deleteInventoryObjects([uploadedPath]);
        return;
      }
      const newDoc: ItemDoc = {
        id: crypto.randomUUID(),
        itemId: item.id,
        name: suggestDocName(docKind, docs),
        kind: docKind,
        data: uploaded ? uploaded.url : dataUrl,
        ...(uploaded ? { path: uploaded.path } : {}),
        w,
        h,
        createdAt: null,
      };
      await onAddDoc(newDoc);
      setDocs((prev) => [...prev, newDoc]);
    } catch (e) {
      // The doc row never landed — don't strand the uploaded object.
      if (uploadedPath) deleteInventoryObjects([uploadedPath]);
      setDocError(e instanceof Error ? e.message : "Couldn't attach that file.");
    } finally {
      setAddingDoc(false);
    }
  };

  const removeDoc = async (id: string) => {
    const path = docs.find((d) => d.id === id)?.path;
    setDocs((prev) => prev.filter((d) => d.id !== id));
    try {
      await onRemoveDoc(id);
      if (path) deleteInventoryObjects([path]);
    } catch {
      /* best-effort; the row is already gone from the UI */
    }
  };

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
    const photos = draft.photos.filter((p) => p.url.trim());
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
      barcode: trimmedOrUndef(draft.barcode),
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
      collection: trimmedOrUndef(draft.collection),
      disposition: draft.disposition || undefined,
      notes: trimmedOrUndef(draft.notes),
    };
    // Orphan control: R2 objects the save no longer references — the item's
    // previous photo when replaced/cleared, and any session uploads that were
    // superseded before saving — get swept. The kept path is exempted.
    const kept = new Set(next.photos.map((p) => p.path).filter(Boolean));
    const sweep = [
      ...(item.photos ?? []).map((p) => p.path),
      ...sessionUploadsRef.current,
    ].filter((p): p is string => Boolean(p) && !kept.has(p));
    sessionUploadsRef.current.clear();
    deleteInventoryObjects(sweep);
    onSave(next);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={closeAndSweep}
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

        {/* Fast path, always here (not buried under "Add details"): scan the
            barcode → look it up → prefill. Works on any phone; if the camera
            isn't reachable the scanner says so and you just type instead. */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
          >
            📷 Scan barcode to autofill
          </button>
          {/* No barcode? Read the text off the item or its box to name it —
              same on-device OCR as the receipt scan, nothing leaves the device. */}
          <label
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm font-medium transition ${
              labelStatus === "scanning"
                ? "text-slate-400"
                : "cursor-pointer text-slate-200 hover:border-blue-400 hover:text-blue-300"
            }`}
          >
            🔤 {labelStatus === "scanning" ? "Reading label…" : "Read label to name it"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={labelStatus === "scanning"}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                scanLabel(f);
              }}
            />
          </label>
        </div>
        {labelStatus === "done" && (
          <p className="-mt-1 text-[11px] text-emerald-300">
            Named it from the label — tweak anything that&apos;s off.
          </p>
        )}
        {labelStatus === "none" && (
          <p className="-mt-1 text-[11px] text-amber-300/90">
            Couldn&apos;t read a name — try a clearer shot of the label, or type it.
          </p>
        )}
        {labelStatus === "error" && (
          <p className="-mt-1 text-[11px] text-amber-300/90">
            Label scan didn&apos;t work — you can still type the name.
          </p>
        )}

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
            <div>
              <label
                className={`flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 px-3 py-2 text-sm font-medium transition ${
                  ocrStatus === "scanning"
                    ? "text-slate-400"
                    : "cursor-pointer text-slate-300 hover:border-blue-400 hover:text-blue-300"
                }`}
              >
                🧾{" "}
                {ocrStatus === "scanning"
                  ? "Reading receipt…"
                  : "Scan a receipt to fill in details"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={ocrStatus === "scanning"}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    scanReceipt(f);
                  }}
                />
              </label>
              {ocrStatus === "done" && (
                <p className="mt-1 text-[11px] text-emerald-300">
                  Filled in what I could read — check the details.
                </p>
              )}
              {ocrStatus === "none" && (
                <p className="mt-1 text-[11px] text-amber-300/90">
                  Couldn&apos;t read much — fill the details in yourself.
                </p>
              )}
              {ocrStatus === "error" && (
                <p className="mt-1 text-[11px] text-amber-300/90">
                  Receipt scan didn&apos;t work — you can still type the details.
                </p>
              )}
              <p className="mt-1 text-[10px] text-slate-500">
                Reads on your device (beta). First use downloads a small
                text-recognition model.
              </p>
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

            <Field label="Barcode (UPC / EAN)">
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.barcode}
                  onChange={(e) => {
                    set("barcode", e.target.value);
                    if (lookupStatus !== "idle") setLookupStatus("idle");
                  }}
                  placeholder="Scan or type…"
                  className={fieldClass}
                />
                {draft.barcode.trim() && (
                  <button
                    type="button"
                    onClick={() => runLookup(draft.barcode)}
                    disabled={lookupStatus === "loading"}
                    className="shrink-0 rounded-lg border border-slate-700 px-3 text-sm font-medium text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                  >
                    {lookupStatus === "loading" ? "…" : "Look up"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  className="shrink-0 rounded-lg border border-slate-700 px-3 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
                >
                  Scan
                </button>
              </div>
              {lookupStatus !== "idle" && (
                <p
                  className={`mt-1 text-[11px] ${
                    lookupStatus === "found"
                      ? "text-emerald-300"
                      : lookupStatus === "none"
                        ? "text-amber-300/90"
                        : "text-slate-400"
                  }`}
                >
                  {lookupStatus === "loading"
                    ? "Looking up product…"
                    : lookupStatus === "found"
                      ? "Filled in what we found — check and tweak."
                      : "No product match — fill in the details yourself."}
                </p>
              )}
            </Field>

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

            <div className="grid grid-cols-2 gap-3">
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
              <Field label="Declutter">
                <select
                  value={draft.disposition}
                  onChange={(e) =>
                    set("disposition", e.target.value as Draft["disposition"])
                  }
                  className={fieldClass}
                >
                  <option value="">Keeping it</option>
                  {DISPOSITIONS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Collection / kit">
              <input
                type="text"
                list="inventory-collections"
                value={draft.collection}
                onChange={(e) => set("collection", e.target.value)}
                placeholder="Group it — camera bag, board games…"
                className={fieldClass}
              />
              <datalist id="inventory-collections">
                {collections.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>

            <div>
              <span className={labelClass}>
                Photos{draft.photos.length > 1 ? ` (${draft.photos.length})` : ""}
                {" — first is the cover"}
              </span>
              {draft.photos.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-2">
                  {draft.photos.map((p, idx) => (
                    <li key={p.id} className="relative">
                      {/* Data/URL photos aren't in next/image's allowlist. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={idx === 0 ? "Cover photo" : `Photo ${idx + 1}`}
                        className={`h-16 w-16 rounded-lg border object-cover ${
                          idx === 0 ? "border-blue-400/60" : "border-slate-700"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        aria-label={`Remove photo ${idx + 1}`}
                        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-slate-300 ring-1 ring-slate-600 transition hover:bg-red-500/80 hover:text-white"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* One photo at a time — keeps the count/byte caps honest. */}
              <div
                className={`flex flex-wrap gap-2 ${compressing ? "pointer-events-none opacity-50" : ""}`}
              >
                <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300">
                  📷 Take photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={compressing}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      onPickPhoto(f);
                    }}
                  />
                </label>
                <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300">
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={compressing}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      onPickPhoto(f);
                    }}
                  />
                </label>
              </div>
              {compressing && (
                <p className="mt-1 text-[11px] text-slate-400">Optimizing photo…</p>
              )}
              {photoError && (
                <p className="mt-1 text-[11px] text-amber-300/90">{photoError}</p>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  type="url"
                  value={photoUrlInput}
                  onChange={(e) => setPhotoUrlInput(e.target.value)}
                  placeholder="or paste an image URL…"
                  aria-label="Add a photo by URL"
                  className={fieldClass}
                />
                {photoUrlInput.trim() && (
                  <button
                    type="button"
                    disabled={compressing}
                    onClick={() => {
                      const url = photoUrlInput.trim();
                      if (!url || draft.photos.length >= MAX_PHOTOS) return;
                      set("photos", [
                        ...draft.photos,
                        { id: crypto.randomUUID(), url },
                      ]);
                      setPhotoUrlInput("");
                    }}
                    className="shrink-0 rounded-lg border border-slate-700 px-3 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
                  >
                    Add
                  </button>
                )}
              </div>
            </div>

            {/* Receipts & documents — stored per-item, saved (synced) items only */}
            {!isNew && (
              <div>
                <span className={labelClass}>Receipts &amp; documents</span>
                {!canAttach ? (
                  <p className="text-xs text-slate-500">
                    Sign in to sync to attach receipts and documents.
                  </p>
                ) : (
                  <>
                    {docsLoading ? (
                      <p className="text-xs text-slate-500">Loading attachments…</p>
                    ) : (
                      docs.length > 0 && (
                        <ul className="mb-2 flex flex-col gap-1.5">
                          {docs.map((d) => (
                            <li
                              key={d.id}
                              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-1.5"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={d.data}
                                alt=""
                                className="h-10 w-10 shrink-0 rounded object-cover"
                              />
                              <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                                {d.name}
                              </span>
                              <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                                {docKindLabel(d.kind)}
                              </span>
                              <a
                                href={d.data}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${d.name}`}
                                className="shrink-0 rounded-md p-1 text-slate-500 transition hover:text-blue-300"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={() => removeDoc(d.id)}
                                aria-label={`Remove ${d.name}`}
                                className="shrink-0 rounded-md p-1 text-slate-500 transition hover:text-red-300"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={docKind}
                        onChange={(e) => setDocKind(e.target.value as ItemDocKind)}
                        aria-label="Attachment type"
                        className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:border-blue-400 focus:outline-none"
                      >
                        {DOC_KINDS.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                      <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300">
                        + Attach
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            addDoc(f);
                          }}
                        />
                      </label>
                      {addingDoc && (
                        <span className="text-[11px] text-slate-400">Attaching…</span>
                      )}
                    </div>
                    {docError && (
                      <p className="mt-1 text-[11px] text-amber-300/90">{docError}</p>
                    )}
                  </>
                )}
              </div>
            )}

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
            onClick={closeAndSweep}
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

      {scanning && (
        <BarcodeScanner
          onDetect={(code) => {
            set("barcode", code);
            setScanning(false);
            runLookup(code);
          }}
          onCancel={() => setScanning(false)}
        />
      )}
    </Modal>
  );
}

export default ItemFormModal;
