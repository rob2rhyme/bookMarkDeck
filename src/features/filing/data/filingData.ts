// src/features/filing/data/filingData.ts
//
// Firestore persistence for the "Filing" pillar. Mirrors inventoryData.ts:
// authenticate with ensureFirebaseGoogleAuth (emailHint), then scope all data
// under users/{uid}.
//
//   users/{uid}/filingPlaces/{id}          -> nestable physical places
//   users/{uid}/filingParties/{id}         -> whose paper it is
//   users/{uid}/filingFolders/{id}         -> the folder you physically pull
//   users/{uid}/filingDocuments/{id}       -> the paper
//   users/{uid}/filingSettings/settings    -> settings doc
//   users/{uid}/filingDocs/{id}            -> attachment pointers (R2 keys)
//
// The existing recursive owner rule (match /users/{uid}/{document=**}) already
// covers these — see FIRESTORE_RULES.md. No rule change required.
//
// Every mapper guards its enums in BOTH directions (read and write), because a
// hand-edited or older document must never crash a list render.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import {
  DOC_TYPES,
  OBLIGATION_KINDS,
  PARTY_KINDS,
  PLACE_KINDS,
  TAB_COLORS,
  normalizeSettings,
  type DocType,
  type FilingActivity,
  type FilingActivityType,
  type FilingDocument,
  type FilingFolder,
  type FilingParty,
  type FilingPlace,
  type FilingSettings,
  type Obligation,
  type ObligationKind,
  type PartyKind,
  type PlaceKind,
  type Recurrence,
  type TabColor,
  type FilingAttachment,
} from "@/features/filing/lib/types";

const placesCol = (uid: string) => collection(db, "users", uid, "filingPlaces");
const partiesCol = (uid: string) => collection(db, "users", uid, "filingParties");
const foldersCol = (uid: string) => collection(db, "users", uid, "filingFolders");
const documentsCol = (uid: string) => collection(db, "users", uid, "filingDocuments");
const settingsDoc = (uid: string) => doc(db, "users", uid, "filingSettings", "settings");
const attachmentsCol = (uid: string) => collection(db, "users", uid, "filingDocs");

async function uidFor(emailHint: string): Promise<string> {
  const user = await ensureFirebaseGoogleAuth(emailHint);
  return user.uid;
}

/* ----------------------------------------------------------- coercion --- */

function timestampToIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof value === "string" ? value : null;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrUndef = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOrUndef = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const boolOrUndef = (v: unknown): boolean | undefined =>
  typeof v === "boolean" ? v : undefined;
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const PLACE_KIND_SET = new Set(PLACE_KINDS.map((k) => k.id).filter(Boolean) as PlaceKind[]);
const PARTY_KIND_SET = new Set(PARTY_KINDS.map((k) => k.id));
const DOC_TYPE_SET = new Set(DOC_TYPES.map((k) => k.id).filter(Boolean) as DocType[]);
const OBLIGATION_KIND_SET = new Set(OBLIGATION_KINDS.map((k) => k.id));
const TAB_COLOR_SET = new Set<string>(TAB_COLORS);
const RECURRENCES = new Set<Recurrence>([
  "none", "monthly", "quarterly", "yearly", "custom",
]);
const ACTIVITY_TYPES = new Set<FilingActivityType>([
  "filed", "moved", "taken", "returned", "renewed",
  "paid", "reviewed", "shredded", "copied", "note",
]);

/** Drop undefined keys — Firestore rejects `undefined` field values. */
function prune<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/* -------------------------------------------------------------- places --- */

function mapPlace(d: { id: string; data: () => Record<string, unknown> }): FilingPlace {
  const data = d.data();
  const kind = data.kind;
  return prune({
    id: d.id,
    name: str(data.name),
    parentId: strOrNull(data.parentId),
    kind: PLACE_KIND_SET.has(kind as PlaceKind) ? (kind as PlaceKind) : undefined,
    note: strOrUndef(data.note),
    sortOrder: numOrUndef(data.sortOrder),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  });
}

export async function fetchPlaces(emailHint: string): Promise<FilingPlace[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(placesCol(uid));
  return snap.docs.map(mapPlace).filter((p) => p.name.trim().length > 0);
}

export async function savePlace(emailHint: string, place: FilingPlace): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(placesCol(uid), place.id),
    prune({
      name: place.name,
      parentId: place.parentId ?? null,
      kind: place.kind,
      note: place.note,
      sortOrder: place.sortOrder,
      createdAt: place.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    { merge: true }
  );
}

export async function deletePlace(emailHint: string, id: string): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(placesCol(uid), id));
}

/* ------------------------------------------------------------- parties --- */

function mapParty(d: { id: string; data: () => Record<string, unknown> }): FilingParty {
  const data = d.data();
  const kind = data.kind;
  const color = data.color;
  return prune({
    id: d.id,
    name: str(data.name),
    kind: PARTY_KIND_SET.has(kind as PartyKind) ? (kind as PartyKind) : "other",
    color: TAB_COLOR_SET.has(str(color)) ? (color as TabColor) : undefined,
    note: strOrUndef(data.note),
    archived: boolOrUndef(data.archived),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  });
}

export async function fetchParties(emailHint: string): Promise<FilingParty[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(partiesCol(uid));
  return snap.docs.map(mapParty).filter((p) => p.name.trim().length > 0);
}

export async function saveParty(emailHint: string, party: FilingParty): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(partiesCol(uid), party.id),
    prune({
      name: party.name,
      kind: party.kind,
      color: party.color,
      note: party.note,
      archived: party.archived ?? false,
      createdAt: party.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    { merge: true }
  );
}

export async function deleteParty(emailHint: string, id: string): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(partiesCol(uid), id));
}

/* ------------------------------------------------------------- folders --- */

function mapFolder(d: { id: string; data: () => Record<string, unknown> }): FilingFolder {
  const data = d.data();
  const color = data.tabColor;
  return prune({
    id: d.id,
    name: str(data.name),
    homePlaceId: strOrNull(data.homePlaceId),
    currentPlaceId: strOrNull(data.currentPlaceId),
    parentId: strOrNull(data.parentId),
    partyId: strOrNull(data.partyId),
    category: strOrUndef(data.category),
    tabColor: TAB_COLOR_SET.has(str(color)) ? (color as TabColor) : undefined,
    aliases: strArray(data.aliases),
    tags: strArray(data.tags),
    retentionRuleId: strOrNull(data.retentionRuleId),
    coversFrom: strOrUndef(data.coversFrom),
    coversThrough: strOrUndef(data.coversThrough),
    eventDate: strOrNull(data.eventDate),
    overrideDestroyOn: strOrNull(data.overrideDestroyOn),
    keepReason: strOrNull(data.keepReason),
    heldBy: strOrNull(data.heldBy),
    takenAt: strOrNull(data.takenAt),
    dueBack: strOrNull(data.dueBack),
    activity: Array.isArray(data.activity)
      ? (data.activity.map(mapActivity).filter(Boolean) as FilingActivity[])
      : undefined,
    note: strOrUndef(data.note),
    archived: boolOrUndef(data.archived),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  });
}

/** Full-document write, no merge: hook state is the source of truth, so this
 *  also clears fields the user emptied. */
function folderPayload(f: FilingFolder) {
  return prune({
    name: f.name,
    homePlaceId: f.homePlaceId ?? null,
    currentPlaceId: f.currentPlaceId ?? null,
    parentId: f.parentId ?? null,
    partyId: f.partyId ?? null,
    category: f.category,
    tabColor: f.tabColor,
    aliases: f.aliases ?? [],
    tags: f.tags ?? [],
    retentionRuleId: f.retentionRuleId ?? null,
    coversFrom: f.coversFrom,
    coversThrough: f.coversThrough,
    eventDate: f.eventDate ?? null,
    overrideDestroyOn: f.overrideDestroyOn ?? null,
    keepReason: f.keepReason ?? null,
    heldBy: f.heldBy ?? null,
    takenAt: f.takenAt ?? null,
    dueBack: f.dueBack ?? null,
    activity: (f.activity ?? []).map((a) => prune({ ...a })),
    note: f.note,
    archived: f.archived ?? false,
    createdAt: f.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function fetchFolders(emailHint: string): Promise<FilingFolder[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(foldersCol(uid));
  return snap.docs.map(mapFolder).filter((f) => f.name.trim().length > 0);
}

export async function saveFolder(emailHint: string, folder: FilingFolder): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(doc(foldersCol(uid), folder.id), folderPayload(folder));
}

export async function deleteFolder(emailHint: string, id: string): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(foldersCol(uid), id));
}

/* ----------------------------------------------------------- documents --- */

function mapObligation(raw: unknown): Obligation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  const dueOn = str(o.dueOn);
  if (!dueOn || !OBLIGATION_KIND_SET.has(kind as ObligationKind)) return null;
  const repeat = o.repeat;
  return prune({
    id: str(o.id) || crypto.randomUUID(),
    kind: kind as ObligationKind,
    dueOn,
    label: strOrUndef(o.label),
    amount: numOrUndef(o.amount),
    currency: strOrUndef(o.currency),
    repeat: RECURRENCES.has(repeat as Recurrence) ? (repeat as Recurrence) : undefined,
    repeatMonths: numOrUndef(o.repeatMonths),
    leadDays: numOrUndef(o.leadDays),
    presetId: strOrUndef(o.presetId),
    completedOn: strOrNull(o.completedOn),
    archived: boolOrUndef(o.archived),
  });
}

function mapActivity(raw: unknown): FilingActivity | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const type = a.type;
  if (!ACTIVITY_TYPES.has(type as FilingActivityType)) return null;
  return prune({
    id: str(a.id) || crypto.randomUUID(),
    type: type as FilingActivityType,
    at: str(a.at) || new Date(0).toISOString(),
    to: strOrUndef(a.to),
    fromPlace: strOrUndef(a.fromPlace),
    toPlace: strOrUndef(a.toPlace),
    note: strOrUndef(a.note),
  });
}

function mapBookmarkLink(raw: unknown): FilingDocument["bookmarkLink"] {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const url = str(b.url);
  if (!url) return null;
  return { id: str(b.id), title: str(b.title), url };
}

function mapDocument(d: { id: string; data: () => Record<string, unknown> }): FilingDocument {
  const data = d.data();
  const docType = data.docType;
  return prune({
    id: d.id,
    title: str(data.title),
    folderId: strOrNull(data.folderId),
    partyId: strOrNull(data.partyId),
    docType: DOC_TYPE_SET.has(docType as DocType) ? (docType as DocType) : undefined,
    docDate: strOrUndef(data.docDate),
    filedAt: strOrUndef(data.filedAt),
    isOriginal: boolOrUndef(data.isOriginal),
    copies: numOrUndef(data.copies),
    confidential: boolOrUndef(data.confidential),
    retentionRuleId: strOrNull(data.retentionRuleId),
    overrideDestroyOn: strOrNull(data.overrideDestroyOn),
    obligations: Array.isArray(data.obligations)
      ? (data.obligations.map(mapObligation).filter(Boolean) as Obligation[])
      : [],
    nextDueOn: strOrNull(data.nextDueOn),
    reference: strOrUndef(data.reference),
    aliases: strArray(data.aliases),
    tags: strArray(data.tags),
    note: strOrUndef(data.note),
    bookmarkLink: mapBookmarkLink(data.bookmarkLink),
    hasAttachment: boolOrUndef(data.hasAttachment),
    activity: Array.isArray(data.activity)
      ? (data.activity.map(mapActivity).filter(Boolean) as FilingActivity[])
      : undefined,
    archived: boolOrUndef(data.archived),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  });
}

function documentPayload(d: FilingDocument) {
  return prune({
    title: d.title,
    folderId: d.folderId ?? null,
    partyId: d.partyId ?? null,
    docType: d.docType,
    docDate: d.docDate,
    filedAt: d.filedAt,
    isOriginal: d.isOriginal ?? false,
    copies: d.copies,
    confidential: d.confidential ?? false,
    retentionRuleId: d.retentionRuleId ?? null,
    overrideDestroyOn: d.overrideDestroyOn ?? null,
    obligations: (d.obligations ?? []).map((o) => prune({ ...o })),
    nextDueOn: d.nextDueOn ?? null,
    reference: d.reference,
    aliases: d.aliases ?? [],
    tags: d.tags ?? [],
    note: d.note,
    bookmarkLink: d.bookmarkLink ?? null,
    hasAttachment: d.hasAttachment ?? false,
    activity: (d.activity ?? []).map((a) => prune({ ...a })),
    archived: d.archived ?? false,
    createdAt: d.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function fetchDocuments(emailHint: string): Promise<FilingDocument[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(documentsCol(uid));
  return snap.docs.map(mapDocument).filter((d) => d.title.trim().length > 0);
}

export async function saveDocument(
  emailHint: string,
  document: FilingDocument
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(doc(documentsCol(uid), document.id), documentPayload(document));
}

export async function deleteDocument(emailHint: string, id: string): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(documentsCol(uid), id));
}

/* ------------------------------------------------------------ settings --- */

export async function fetchSettings(emailHint: string): Promise<FilingSettings | null> {
  const uid = await uidFor(emailHint);
  const snap = await getDoc(settingsDoc(uid));
  return snap.exists() ? normalizeSettings(snap.data()) : null;
}

export async function saveSettings(
  emailHint: string,
  settings: FilingSettings
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(settingsDoc(uid), { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

/* -------------------------------------------------------- attachments --- */

function mapAttachment(d: {
  id: string;
  data: () => Record<string, unknown>;
}): FilingAttachment | null {
  const data = d.data();
  const path = str(data.path);
  const url = str(data.url);
  // A pointer with no object behind it is worse than no pointer — it renders as
  // a broken link the user can't act on. Drop it.
  if (!path || !url) return null;
  return {
    id: d.id,
    documentId: str(data.documentId),
    name: str(data.name) || "Attachment",
    contentType: str(data.contentType),
    size: typeof data.size === "number" ? data.size : 0,
    path,
    url,
    addedAt: timestampToIso(data.addedAt),
  };
}

export async function fetchAttachments(
  emailHint: string,
  documentId?: string
): Promise<FilingAttachment[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(attachmentsCol(uid));
  return snap.docs
    .map(mapAttachment)
    .filter((a): a is FilingAttachment => a !== null)
    .filter((a) => !documentId || a.documentId === documentId);
}

export async function saveAttachment(
  emailHint: string,
  attachment: FilingAttachment
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(attachmentsCol(uid), attachment.id),
    prune({
      documentId: attachment.documentId,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      path: attachment.path,
      url: attachment.url,
      addedAt: attachment.addedAt ?? serverTimestamp(),
    })
  );
}

export async function deleteAttachment(emailHint: string, id: string): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(attachmentsCol(uid), id));
}

/* --------------------------------------------------- realtime listeners --- */

type Unsub = () => void;

function onListenError(label: string) {
  return (err: unknown) => {
    console.error(`[filing] ${label} listener error:`, err);
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
      console.error("[filing] listener auth failed:", err);
    });
  return () => {
    cancelled = true;
    unsub();
  };
}

export function subscribePlaces(emailHint: string, cb: (v: FilingPlace[]) => void): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      placesCol(uid),
      (snap) => cb(snap.docs.map(mapPlace).filter((p) => p.name.trim().length > 0)),
      onListenError("places")
    )
  );
}

export function subscribeParties(emailHint: string, cb: (v: FilingParty[]) => void): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      partiesCol(uid),
      (snap) => cb(snap.docs.map(mapParty).filter((p) => p.name.trim().length > 0)),
      onListenError("parties")
    )
  );
}

export function subscribeFolders(emailHint: string, cb: (v: FilingFolder[]) => void): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      foldersCol(uid),
      (snap) => cb(snap.docs.map(mapFolder).filter((f) => f.name.trim().length > 0)),
      onListenError("folders")
    )
  );
}

/**
 * All documents. `folderId` is accepted from day one so switching to per-folder
 * lazy loading past the documented threshold is a one-line change — see
 * ANALYSIS-FILING-LOG.md §7 on scale.
 */
export function subscribeDocuments(
  emailHint: string,
  cb: (v: FilingDocument[]) => void,
  folderId?: string
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      documentsCol(uid),
      (snap) =>
        cb(
          snap.docs
            .map(mapDocument)
            .filter((d) => d.title.trim().length > 0)
            .filter((d) => (folderId ? d.folderId === folderId : true))
        ),
      onListenError("documents")
    )
  );
}
