// src/features/inventory/data/inventoryData.ts
//
// Firestore persistence for the "My Stuff" inventory pillar. Mirrors focusData.ts
// and the firestoreShortcuts pattern: authenticate with ensureFirebaseGoogleAuth
// (emailHint), then scope all data under users/{uid}.
//
//   users/{uid}/inventoryItems/{itemId}       -> one doc per item
//   users/{uid}/inventoryLocations/{id}        -> nestable storage locations
//   users/{uid}/inventorySettings/settings     -> settings doc
//
// The existing recursive owner rule (match /users/{uid}/{document=**}) already
// covers these — see FIRESTORE_RULES.md. No Firebase Storage yet; photos hold a
// direct URL until the Blaze-gated upload pipeline lands.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import { onConfirmedSnapshot, type SnapshotMeta } from "@/lib/firestoreSnapshot";
import {
  normalizeSettings,
  type InventoryItem,
  type InventoryLocation,
  type InventorySettings,
  type ItemActivity,
  type ItemActivityType,
  type ItemCondition,
  type ItemDisposition,
  type ItemDoc,
  type ItemDocKind,
  type BillingCycle,
  type ItemKind,
  type ItemStatus,
  type PriceLink,
  type ReadStatus,
  type WishlistItem,
} from "@/features/inventory/lib/types";

const itemsCol = (uid: string) => collection(db, "users", uid, "inventoryItems");
const locationsCol = (uid: string) =>
  collection(db, "users", uid, "inventoryLocations");
const docsCol = (uid: string) => collection(db, "users", uid, "inventoryDocs");
const wishlistCol = (uid: string) =>
  collection(db, "users", uid, "inventoryWishlist");
const settingsDoc = (uid: string) =>
  doc(db, "users", uid, "inventorySettings", "settings");

async function uidFor(emailHint: string): Promise<string> {
  const user = await ensureFirebaseGoogleAuth(emailHint);
  return user.uid;
}

function timestampToIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof value === "string" ? value : null;
}

const CONDITIONS = new Set<ItemCondition>([
  "new",
  "open-box",
  "good",
  "fair",
  "poor",
]);
const DISPOSITION_SET = new Set<ItemDisposition>([
  "donate",
  "sell",
  "giveaway",
  "trash",
]);
const KIND_SET = new Set<ItemKind>([
  "book",
  "food",
  "selfcare",
  "clothing",
  "tool",
  "digital",
]);
const CYCLE_SET = new Set<BillingCycle>(["once", "monthly", "yearly"]);
const READ_SET = new Set<ReadStatus>(["unread", "reading", "read"]);
const STATUS_SET = new Set<ItemStatus>([
  "have",
  "lent",
  "misplaced",
  "lost",
  "returned",
]);
const ACTIVITY_TYPES = new Set<ItemActivityType>([
  "acquired",
  "used",
  "lent",
  "returned",
  "refunded",
  "relocated",
  "misplaced",
  "lost",
  "found",
  "note",
]);

/** Coerce a raw compare-links array (same shape for items and wishes). */
function mapCompareLinks(raw: unknown): PriceLink[] | undefined {
  const list = (Array.isArray(raw) ? raw : [])
    .map((l) => {
      const r = (l ?? {}) as Record<string, unknown>;
      if (typeof r.url !== "string" || !r.url.trim()) return null;
      return prune({
        id: typeof r.id === "string" ? r.id : r.url,
        store: typeof r.store === "string" ? r.store : "",
        url: r.url,
        price: numOrUndef(r.price),
        currency: strOrUndef(r.currency),
      }) as PriceLink;
    })
    .filter((l): l is PriceLink => l !== null);
  return list.length ? list : undefined;
}

/** Coerce a raw activity array (an item's life history). */
function mapActivity(raw: unknown): ItemActivity[] | undefined {
  const list = (Array.isArray(raw) ? raw : [])
    .map((a) => {
      const r = (a ?? {}) as Record<string, unknown>;
      if (
        typeof r.type !== "string" ||
        !ACTIVITY_TYPES.has(r.type as ItemActivityType) ||
        typeof r.at !== "string"
      ) {
        return null;
      }
      return prune({
        id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
        type: r.type as ItemActivityType,
        at: r.at,
        to: strOrUndef(r.to),
        fromLoc: strOrUndef(r.fromLoc),
        toLoc: strOrUndef(r.toLoc),
        condition:
          typeof r.condition === "string" &&
          CONDITIONS.has(r.condition as ItemCondition)
            ? (r.condition as ItemCondition)
            : undefined,
        note: strOrUndef(r.note),
      }) as ItemActivity;
    })
    .filter((a): a is ItemActivity => a !== null);
  return list.length ? list : undefined;
}
const numOrUndef = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const strOrUndef = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;

/** Drop undefined keys — Firestore rejects `undefined` field values. */
function prune<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/* ----------------------------------------------------------------- items --- */

function mapItem(d: {
  id: string;
  data: () => Record<string, unknown>;
}): InventoryItem {
  const data = d.data();
  const cond = data.condition;
  const photos = Array.isArray(data.photos) ? data.photos : [];
  return prune({
    id: d.id,
    name: typeof data.name === "string" ? data.name : "",
    description: strOrUndef(data.description),
    locationId: typeof data.locationId === "string" ? data.locationId : null,
    category: strOrUndef(data.category),
    kind:
      typeof data.kind === "string" && KIND_SET.has(data.kind as ItemKind)
        ? (data.kind as ItemKind)
        : undefined,
    author: strOrUndef(data.author),
    readStatus:
      typeof data.readStatus === "string" &&
      READ_SET.has(data.readStatus as ReadStatus)
        ? (data.readStatus as ReadStatus)
        : undefined,
    useBy: strOrUndef(data.useBy),
    openedDate: strOrUndef(data.openedDate),
    paoMonths: numOrUndef(data.paoMonths),
    size: strOrUndef(data.size),
    billingCycle:
      typeof data.billingCycle === "string" &&
      CYCLE_SET.has(data.billingCycle as BillingCycle)
        ? (data.billingCycle as BillingCycle)
        : undefined,
    renewsOn: strOrUndef(data.renewsOn),
    tags: Array.isArray(data.tags)
      ? data.tags.filter((t): t is string => typeof t === "string")
      : [],
    quantity: Math.max(1, Math.round(numOrUndef(data.quantity) ?? 1)),
    purchaseDate: strOrUndef(data.purchaseDate),
    price: numOrUndef(data.price),
    taxRate: numOrUndef(data.taxRate),
    currency: strOrUndef(data.currency),
    retailer: strOrUndef(data.retailer),
    storeUrl: strOrUndef(data.storeUrl),
    compareLinks: mapCompareLinks(data.compareLinks),
    manufacturer: strOrUndef(data.manufacturer),
    model: strOrUndef(data.model),
    serial: strOrUndef(data.serial),
    barcode: strOrUndef(data.barcode),
    warrantyExpiry: strOrUndef(data.warrantyExpiry),
    warrantyCost: numOrUndef(data.warrantyCost),
    warrantyYears: numOrUndef(data.warrantyYears),
    maintenanceDate: strOrUndef(data.maintenanceDate),
    condition:
      typeof cond === "string" && CONDITIONS.has(cond as ItemCondition)
        ? (cond as ItemCondition)
        : undefined,
    inBox: typeof data.inBox === "boolean" ? data.inBox : undefined,
    value: numOrUndef(data.value),
    notes: strOrUndef(data.notes),
    status:
      typeof data.status === "string" && STATUS_SET.has(data.status as ItemStatus)
        ? (data.status as ItemStatus)
        : undefined,
    origin:
      data.origin === "borrowed" || data.origin === "rented"
        ? data.origin
        : undefined,
    borrowedFrom: strOrUndef(data.borrowedFrom),
    borrowReturnBy: strOrUndef(data.borrowReturnBy),
    activity: mapActivity(data.activity),
    lentTo: typeof data.lentTo === "string" ? data.lentTo : null,
    lentDate: typeof data.lentDate === "string" ? data.lentDate : null,
    dueDate: typeof data.dueDate === "string" ? data.dueDate : null,
    disposition:
      typeof data.disposition === "string" &&
      DISPOSITION_SET.has(data.disposition as ItemDisposition)
        ? (data.disposition as ItemDisposition)
        : undefined,
    releasedDate: typeof data.releasedDate === "string" ? data.releasedDate : null,
    projectName: strOrUndef(data.projectName),
    collection: strOrUndef(data.collection),
    links: (Array.isArray(data.links) ? data.links : [])
      .map((l) => {
        const r = (l ?? {}) as Record<string, unknown>;
        if (typeof r.url !== "string" || !r.url.trim()) return null;
        return {
          id: typeof r.id === "string" ? r.id : r.url,
          title:
            typeof r.title === "string" && r.title.trim() ? r.title : r.url,
          url: r.url,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null),
    photos: photos
      .map((p) => {
        const r = (p ?? {}) as Record<string, unknown>;
        if (typeof r.url !== "string" || !r.url.trim()) return null;
        return prune({
          id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
          url: r.url,
          path: strOrUndef(r.path),
          w: numOrUndef(r.w),
          h: numOrUndef(r.h),
        });
      })
      .filter((p): p is NonNullable<typeof p> => p !== null),
    archived: Boolean(data.archived),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  }) as InventoryItem;
}

function itemPayload(item: InventoryItem): Record<string, unknown> {
  return prune({
    name: item.name,
    description: strOrUndef(item.description),
    locationId: item.locationId ?? null,
    category: strOrUndef(item.category),
    kind: item.kind && KIND_SET.has(item.kind) ? item.kind : undefined,
    author: strOrUndef(item.author),
    readStatus:
      item.readStatus && READ_SET.has(item.readStatus)
        ? item.readStatus
        : undefined,
    useBy: strOrUndef(item.useBy),
    openedDate: strOrUndef(item.openedDate),
    paoMonths: numOrUndef(item.paoMonths),
    size: strOrUndef(item.size),
    billingCycle:
      item.billingCycle && CYCLE_SET.has(item.billingCycle)
        ? item.billingCycle
        : undefined,
    renewsOn: strOrUndef(item.renewsOn),
    tags: item.tags ?? [],
    quantity: Math.max(1, Math.round(item.quantity || 1)),
    purchaseDate: strOrUndef(item.purchaseDate),
    price: numOrUndef(item.price),
    taxRate: numOrUndef(item.taxRate),
    currency: strOrUndef(item.currency),
    retailer: strOrUndef(item.retailer),
    storeUrl: strOrUndef(item.storeUrl),
    compareLinks: item.compareLinks?.length
      ? item.compareLinks.map((l) =>
          prune({
            id: l.id,
            store: l.store,
            url: l.url,
            price: numOrUndef(l.price),
            currency: strOrUndef(l.currency),
          })
        )
      : undefined,
    manufacturer: strOrUndef(item.manufacturer),
    model: strOrUndef(item.model),
    serial: strOrUndef(item.serial),
    barcode: strOrUndef(item.barcode),
    warrantyExpiry: strOrUndef(item.warrantyExpiry),
    warrantyCost: numOrUndef(item.warrantyCost),
    warrantyYears: numOrUndef(item.warrantyYears),
    maintenanceDate: strOrUndef(item.maintenanceDate),
    condition: item.condition,
    inBox: typeof item.inBox === "boolean" ? item.inBox : undefined,
    value: numOrUndef(item.value),
    notes: strOrUndef(item.notes),
    status: item.status && STATUS_SET.has(item.status) ? item.status : undefined,
    origin: item.origin,
    borrowedFrom: strOrUndef(item.borrowedFrom),
    borrowReturnBy: strOrUndef(item.borrowReturnBy),
    activity: item.activity?.length
      ? item.activity.map((a) =>
          prune({
            id: a.id,
            type: a.type,
            at: a.at,
            to: strOrUndef(a.to),
            fromLoc: strOrUndef(a.fromLoc),
            toLoc: strOrUndef(a.toLoc),
            condition: a.condition,
            note: strOrUndef(a.note),
          })
        )
      : undefined,
    lentTo: item.lentTo?.trim() ? item.lentTo.trim() : null,
    lentDate: item.lentDate ?? null,
    dueDate: item.dueDate ?? null,
    disposition: item.disposition,
    releasedDate: item.releasedDate ?? null,
    projectName: strOrUndef(item.projectName),
    collection: strOrUndef(item.collection),
    links: (item.links ?? []).map((l) => ({ id: l.id, title: l.title, url: l.url })),
    photos: (item.photos ?? []).map((p) =>
      prune({ id: p.id, url: p.url, path: p.path, w: p.w, h: p.h })
    ),
    archived: Boolean(item.archived),
    createdAt: item.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function fetchItems(emailHint: string): Promise<InventoryItem[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(itemsCol(uid));
  return snap.docs.map(mapItem).filter((i) => i.name.trim().length > 0);
}

/** Full-document write (no merge) — hook state is the source of truth, so this
 *  also clears fields the user emptied. Id-preserving, so re-saving is idempotent. */
export async function saveItem(
  emailHint: string,
  item: InventoryItem
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(doc(itemsCol(uid), item.id), itemPayload(item));
}

export async function deleteItem(emailHint: string, id: string): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(itemsCol(uid), id));
}

/* ----------------------------------------------------------- attachments --- */

const DOC_KIND_SET = new Set<ItemDocKind>([
  "receipt",
  "manual",
  "warranty",
  "photo",
  "other",
]);

function mapDoc(d: { id: string; data: () => Record<string, unknown> }): ItemDoc {
  const data = d.data();
  const kind = data.kind as ItemDocKind;
  return {
    id: d.id,
    itemId: typeof data.itemId === "string" ? data.itemId : "",
    name: typeof data.name === "string" ? data.name : "",
    kind: DOC_KIND_SET.has(kind) ? kind : "other",
    data: typeof data.data === "string" ? data.data : "",
    path: strOrUndef(data.path),
    w: numOrUndef(data.w),
    h: numOrUndef(data.h),
    createdAt: timestampToIso(data.createdAt),
  };
}

/** Attachments for one item, oldest first. Loaded on demand (not subscribed),
 *  so the item list never carries attachment bytes. */
export async function fetchItemDocs(
  emailHint: string,
  itemId: string
): Promise<ItemDoc[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(query(docsCol(uid), where("itemId", "==", itemId)));
  return snap.docs
    .map(mapDoc)
    .filter((d) => d.data.length > 0)
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

export async function saveItemDoc(emailHint: string, d: ItemDoc): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(docsCol(uid), d.id),
    prune({
      itemId: d.itemId,
      name: d.name,
      kind: d.kind,
      data: d.data,
      path: strOrUndef(d.path),
      w: d.w,
      h: d.h,
      // Preserve the original stamp on rewrite so doc ordering never resets.
      createdAt: d.createdAt ?? serverTimestamp(),
    })
  );
}

export async function deleteItemDoc(emailHint: string, id: string): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(docsCol(uid), id));
}

/** Remove every attachment for an item — called when the item itself is deleted. */
export async function deleteItemDocs(
  emailHint: string,
  itemId: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(query(docsCol(uid), where("itemId", "==", itemId)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

/* ------------------------------------------------------------- locations --- */

function mapLocation(d: {
  id: string;
  data: () => Record<string, unknown>;
}): InventoryLocation {
  const data = d.data();
  return {
    id: d.id,
    name: typeof data.name === "string" ? data.name : "",
    parentId: typeof data.parentId === "string" ? data.parentId : null,
    sortOrder: numOrUndef(data.sortOrder),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export async function fetchLocations(
  emailHint: string
): Promise<InventoryLocation[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(locationsCol(uid));
  return snap.docs.map(mapLocation).filter((l) => l.name.trim().length > 0);
}

export async function saveLocation(
  emailHint: string,
  location: InventoryLocation
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(locationsCol(uid), location.id),
    prune({
      name: location.name,
      parentId: location.parentId ?? null,
      sortOrder: location.sortOrder,
      createdAt: location.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    { merge: true }
  );
}

export async function deleteLocation(
  emailHint: string,
  id: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(locationsCol(uid), id));
}

/* -------------------------------------------------------------- settings --- */

export async function fetchSettings(
  emailHint: string
): Promise<InventorySettings | null> {
  const uid = await uidFor(emailHint);
  const snap = await getDoc(settingsDoc(uid));
  if (!snap.exists()) return null;
  return normalizeSettings(snap.data());
}

export async function saveSettings(
  emailHint: string,
  settings: InventorySettings
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(settingsDoc(uid), { ...settings, updatedAt: serverTimestamp() });
}

/* --------------------------------------------------------------- import --- */

/** Restore an inventory JSON backup into cloud data. Id-preserving and
 *  best-effort: one failed write doesn't abort the rest. */
export async function restoreInventoryBackup(
  emailHint: string,
  b: { items: InventoryItem[]; locations: InventoryLocation[]; settings: InventorySettings }
): Promise<void> {
  await Promise.allSettled([
    ...b.locations.map((l) => saveLocation(emailHint, l)),
    ...b.items.map((i) => saveItem(emailHint, i)),
    saveSettings(emailHint, b.settings),
  ]);
}

/* --------------------------------------------------- realtime listeners --- */

type Unsub = () => void;

function onListenError(label: string) {
  return (err: unknown) => {
    console.error(`[inventory] ${label} listener error:`, err);
  };
}

function listen(emailHint: string, attach: (uid: string) => Unsub): Unsub {
  let unsub: Unsub = () => {};
  let cancelled = false;
  uidFor(emailHint)
    .then((uid) => {
      if (!cancelled) unsub = attach(uid);
    })
    .catch((err) => {
      console.error("[inventory] listener auth failed:", err);
    });
  return () => {
    cancelled = true;
    unsub();
  };
}

export function subscribeItems(
  emailHint: string,
  cb: (items: InventoryItem[], meta: SnapshotMeta) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onConfirmedSnapshot(
      itemsCol(uid),
      (snap, meta) => cb(snap.docs.map(mapItem).filter((i) => i.name.trim().length > 0), meta),
      onListenError("items")
    )
  );
}

export function subscribeLocations(
  emailHint: string,
  cb: (locations: InventoryLocation[], meta: SnapshotMeta) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onConfirmedSnapshot(
      locationsCol(uid),
      (snap, meta) =>
        cb(snap.docs.map(mapLocation).filter((l) => l.name.trim().length > 0), meta),
      onListenError("locations")
    )
  );
}

/* -------------------------------------------------------------- wishlist --- */

function mapWishlistCompareLinks(raw: unknown): WishlistItem["compareLinks"] {
  const links = (Array.isArray(raw) ? raw : [])
    .map((l) => {
      const r = (l ?? {}) as Record<string, unknown>;
      if (typeof r.url !== "string" || !r.url.trim()) return null;
      return {
        id: typeof r.id === "string" ? r.id : r.url,
        store: typeof r.store === "string" ? r.store : "",
        url: r.url,
        price: numOrUndef(r.price),
        currency: strOrUndef(r.currency),
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  return links.length ? links : undefined;
}

function mapWishlist(d: {
  id: string;
  data: () => Record<string, unknown>;
}): WishlistItem {
  const data = d.data();
  const link = (data.link ?? {}) as Record<string, unknown>;
  return prune({
    id: d.id,
    name: typeof data.name === "string" ? data.name : "",
    note: strOrUndef(data.note),
    estPrice: numOrUndef(data.estPrice),
    currency: strOrUndef(data.currency),
    category: strOrUndef(data.category),
    barcode: strOrUndef(data.barcode),
    compareLinks: mapWishlistCompareLinks(data.compareLinks),
    imageUrl: strOrUndef(data.imageUrl),
    restockOf: strOrUndef(data.restockOf),
    link:
      typeof link.url === "string" && link.url.trim()
        ? {
            id: typeof link.id === "string" ? link.id : link.url,
            title:
              typeof link.title === "string" && link.title.trim()
                ? link.title
                : (link.url as string),
            url: link.url as string,
          }
        : undefined,
    createdAt: timestampToIso(data.createdAt),
  }) as WishlistItem;
}

export async function fetchWishlist(emailHint: string): Promise<WishlistItem[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(wishlistCol(uid));
  return snap.docs.map(mapWishlist).filter((w) => w.name.trim().length > 0);
}

export async function saveWishlist(
  emailHint: string,
  w: WishlistItem
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(wishlistCol(uid), w.id),
    prune({
      name: w.name,
      note: strOrUndef(w.note),
      estPrice: numOrUndef(w.estPrice),
      currency: strOrUndef(w.currency),
      category: strOrUndef(w.category),
      barcode: strOrUndef(w.barcode),
      imageUrl: strOrUndef(w.imageUrl),
      restockOf: strOrUndef(w.restockOf),
      compareLinks: w.compareLinks?.length
        ? w.compareLinks.map((l) =>
            prune({
              id: l.id,
              store: l.store,
              url: l.url,
              price: numOrUndef(l.price),
              currency: strOrUndef(l.currency),
            })
          )
        : undefined,
      link: w.link ? { id: w.link.id, title: w.link.title, url: w.link.url } : undefined,
      createdAt: w.createdAt ?? serverTimestamp(),
    })
  );
}

export async function deleteWishlist(
  emailHint: string,
  id: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(wishlistCol(uid), id));
}

export function subscribeWishlist(
  emailHint: string,
  cb: (items: WishlistItem[], meta: SnapshotMeta) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onConfirmedSnapshot(
      wishlistCol(uid),
      (snap, meta) =>
        cb(snap.docs.map(mapWishlist).filter((w) => w.name.trim().length > 0), meta),
      onListenError("wishlist")
    )
  );
}
