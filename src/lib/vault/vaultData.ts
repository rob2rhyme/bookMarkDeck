// Firestore persistence for the account's vault records, shared by every pillar
// that locks something (Notes, Filing). A record is salts, IVs and WRAPPED keys —
// nothing that opens anything without the passphrase or recovery code (see
// ./vault.ts). They live under `users/{uid}/notesVaults`: the name predates Filing
// sharing the vault, and renaming a collection is a migration for no gain.
//
// The existing recursive owner rule covers the path; no rules change.

import { collection, doc, getDocsFromServer, setDoc } from "firebase/firestore";

import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import { onConfirmedSnapshot, type SnapshotMeta } from "@/lib/firestoreSnapshot";
import { normalizeVault, type VaultRecord } from "@/lib/vault/vault";

const vaultsCol = (uid: string) => collection(db, "users", uid, "notesVaults");

async function uidFor(emailHint: string): Promise<string> {
  const user = await ensureFirebaseGoogleAuth(emailHint);
  return user.uid;
}

const mapVaults = (docs: { id: string; data: () => Record<string, unknown> }[]) =>
  docs.map((d) => normalizeVault({ ...d.data(), id: d.id })).filter((v): v is VaultRecord => v !== null);

export async function fetchVaults(emailHint: string): Promise<VaultRecord[]> {
  const uid = await uidFor(emailHint);
  return mapVaults((await getDocsFromServer(vaultsCol(uid))).docs);
}

export async function saveVault(emailHint: string, vault: VaultRecord): Promise<void> {
  const uid = await uidFor(emailHint);
  const { id, ...rest } = vault;
  await setDoc(doc(vaultsCol(uid), id), rest);
}

type Unsub = () => void;

export function subscribeVaults(
  emailHint: string,
  cb: (vaults: VaultRecord[], meta: SnapshotMeta) => void
): Unsub {
  let unsub: Unsub = () => {};
  let cancelled = false;
  uidFor(emailHint)
    .then((uid) => {
      if (cancelled) return;
      unsub = onConfirmedSnapshot(
        vaultsCol(uid),
        (snap, meta) => cb(mapVaults(snap.docs), meta),
        (err) => console.error("[vault] listener error:", err)
      );
    })
    .catch((err) => console.error("[vault] listener auth failed:", err));
  return () => {
    cancelled = true;
    unsub();
  };
}
