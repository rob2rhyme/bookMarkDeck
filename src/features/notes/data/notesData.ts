// src/features/notes/data/notesData.ts
//
// Firestore persistence for the Notes pillar. Same shape as filingData.ts:
// authenticate with ensureFirebaseGoogleAuth (emailHint), then scope all data
// under users/{uid}.
//
//   users/{uid}/notes/{noteId} -> { title, body, pinned, tags[], createdAt, updatedAt }
//
// The existing recursive owner rule (match /users/{uid}/{document=**}) covers
// this collection — see FIRESTORE_RULES.md. No rule change required.

import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
} from "firebase/firestore";

import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import { normalizeNote, type Note } from "@/features/notes/lib/notes";
import { normalizeVault, type VaultRecord } from "@/features/notes/lib/vault";

const notesCol = (uid: string) => collection(db, "users", uid, "notes");
// Locked notes' vault records: salts, IVs and WRAPPED keys — nothing that opens a
// note without the passphrase or recovery code. See lib/vault.ts.
const vaultsCol = (uid: string) => collection(db, "users", uid, "notesVaults");

async function uidFor(emailHint: string): Promise<string> {
  const user = await ensureFirebaseGoogleAuth(emailHint);
  return user.uid;
}

function timestampToIso(value: unknown): unknown {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return value;
}

/** A document → Note, guarding every field (a hand-edited doc must not crash the list). */
export function mapNote(d: { id: string; data: () => Record<string, unknown> }): Note | null {
  const data = d.data();
  return normalizeNote({
    ...data,
    id: d.id,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  });
}

/**
 * The write payload. Timestamps are the CLIENT's instants, not serverTimestamp():
 * the list orders by updatedAt, and a pending serverTimestamp reads back as null
 * in the local snapshot, which would drop a note being typed to the bottom.
 */
export function toFirestore(note: Note) {
  // The one rule locking exists for: plaintext of a locked note never leaves the device.
  if (note.lock && note.body) throw new Error("Refusing to write a locked note's plaintext.");
  const at = (iso: string) => {
    const d = new Date(iso);
    return Timestamp.fromDate(Number.isNaN(d.getTime()) ? new Date() : d);
  };
  return {
    title: note.title,
    body: note.body,
    pinned: note.pinned,
    tags: note.tags,
    lock: note.lock ?? null,
    createdAt: at(note.createdAt),
    updatedAt: at(note.updatedAt),
  };
}

const mapAll = (docs: { id: string; data: () => Record<string, unknown> }[]) =>
  docs.map(mapNote).filter((n): n is Note => n !== null);

export async function fetchNotes(emailHint: string): Promise<Note[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(notesCol(uid));
  return mapAll(snap.docs);
}

/** Notes are always complete records, so this replaces the document (no merge). */
export async function saveNote(emailHint: string, note: Note): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(doc(notesCol(uid), note.id), toFirestore(note));
}

export async function deleteNote(emailHint: string, id: string): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(notesCol(uid), id));
}

type Unsub = () => void;

export function subscribeNotes(emailHint: string, cb: (notes: Note[]) => void): Unsub {
  let unsub: Unsub = () => {};
  let cancelled = false;
  uidFor(emailHint)
    .then((uid) => {
      if (cancelled) return;
      unsub = onSnapshot(
        notesCol(uid),
        (snap) => cb(mapAll(snap.docs)),
        (err) => console.error("[notes] listener error:", err)
      );
    })
    .catch((err) => console.error("[notes] listener auth failed:", err));
  return () => {
    cancelled = true;
    unsub();
  };
}

/* --------------------------------------------------------------- vaults --- */

const mapVaults = (docs: { id: string; data: () => Record<string, unknown> }[]) =>
  docs.map((d) => normalizeVault({ ...d.data(), id: d.id })).filter((v): v is VaultRecord => v !== null);

export async function fetchVaults(emailHint: string): Promise<VaultRecord[]> {
  const uid = await uidFor(emailHint);
  return mapVaults((await getDocs(vaultsCol(uid))).docs);
}

export async function saveVault(emailHint: string, vault: VaultRecord): Promise<void> {
  const uid = await uidFor(emailHint);
  const { id, ...rest } = vault;
  await setDoc(doc(vaultsCol(uid), id), rest);
}

export function subscribeVaults(emailHint: string, cb: (vaults: VaultRecord[]) => void): Unsub {
  let unsub: Unsub = () => {};
  let cancelled = false;
  uidFor(emailHint)
    .then((uid) => {
      if (cancelled) return;
      unsub = onSnapshot(
        vaultsCol(uid),
        (snap) => cb(mapVaults(snap.docs)),
        (err) => console.error("[notes] vault listener error:", err)
      );
    })
    .catch((err) => console.error("[notes] vault listener auth failed:", err));
  return () => {
    cancelled = true;
    unsub();
  };
}
