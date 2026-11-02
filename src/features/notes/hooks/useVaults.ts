"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchVaults, saveVault, subscribeVaults } from "@/features/notes/data/notesData";
import {
  normalizeVault,
  openVault,
  resetPassphrase,
  WrongSecretError,
  type VaultRecord,
} from "@/features/notes/lib/vault";
import { addKeys, unlockedKids } from "@/features/notes/lib/vaultSession";
import { clearPendingUpserts, queueUpsert, unqueueUpsert } from "@/utils/pendingDeletes";
import { recordSyncedIdsUnlessPending, toUpload } from "@/utils/syncedIds";

// The account's vault records (lib/vault.ts), cached per user and synced like
// notes. NOTHING HERE EVER DELETES A VAULT: a vault is the only way into the
// notes locked with it, so a dropped record is lost notes. Two devices that each
// set up a vault while offline simply end up with two; every locked note names
// the vault it used, and unlocking tries the passphrase on each.

const DOMAIN = "notesVaults";
const BASE_KEY = "bookmarkdeck:notes:vaults:v1";
const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);

function loadLocal(email?: string | null): VaultRecord[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(keyFor(email)) ?? "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeVault).filter((v): v is VaultRecord => v !== null) : [];
  } catch {
    return [];
  }
}

/** Union by id; `prefer`'s copy wins where both have one. */
function union(prefer: VaultRecord[], other: VaultRecord[]): VaultRecord[] {
  const ids = new Set(prefer.map((v) => v.id));
  return [...prefer, ...other.filter((v) => !ids.has(v.id))].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function useVaults(email?: string | null, connected = false) {
  const [vaults, setVaults] = useState<VaultRecord[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const ref = useRef<VaultRecord[]>([]);
  const canSync = connected && Boolean(email);
  const hydrated = loadedKey === keyFor(email);

  const commit = useCallback(
    (next: VaultRecord[]) => {
      ref.current = next;
      setVaults(next);
      try {
        window.localStorage.setItem(keyFor(email), JSON.stringify(next));
      } catch {
        /* quota — the cloud copy remains once synced */
      }
    },
    [email]
  );

  useEffect(() => {
    const local = loadLocal(email);
    ref.current = local;
    setVaults(local);
    setLoadedKey(keyFor(email));
  }, [email]);

  useEffect(() => {
    const key = keyFor(email);
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== window.localStorage || e.key !== key) return;
      const next = union(loadLocal(email), ref.current);
      ref.current = next;
      setVaults(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [email]);

  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      const cloud = await fetchVaults(email);
      const cloudIds = new Set(cloud.map((v) => v.id));
      await Promise.all(toUpload(ref.current, cloudIds, DOMAIN, email).map((v) => saveVault(email, v).catch(() => {})));
      clearPendingUpserts(DOMAIN, email);
    })()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        unsub = subscribeVaults(email, (cloud, meta) => {
          recordSyncedIdsUnlessPending(DOMAIN, email, cloud.map((v) => v.id), meta);
          // Never drop a local vault the cloud lacks — see the header.
          commit(union(cloud, ref.current));
          setCloudLoaded(true);
        });
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [canSync, email, commit]);

  /** Store a new or re-wrapped vault (cache at once, cloud when connected). */
  const putVault = useCallback(
    (vault: VaultRecord): Promise<void> => {
      commit(union([vault], ref.current));
      // Queued first, cleared only once the cloud has it: a failed or interrupted
      // save is retried on the next connect instead of leaving the vault on one
      // device while notes locked with it sync everywhere.
      queueUpsert(DOMAIN, email, vault.id);
      if (!canSync || !email) return Promise.resolve();
      return saveVault(email, vault)
        .then(() => unqueueUpsert(DOMAIN, email, vault.id))
        .catch((err) => console.error("[notes] vault save failed; will retry on reconnect:", err));
    },
    [canSync, email, commit]
  );

  /**
   * Try the passphrase on every vault; unlock each it opens. A passphrase set on
   * one device and changed on another may open some vaults and not others —
   * opening at least one counts as success.
   */
  const unlock = useCallback(async (passphrase: string): Promise<void> => {
    const opened = await Promise.all(
      ref.current.map(async (v) => {
        try {
          return [v.id, await openVault(v, passphrase)] as [string, CryptoKey];
        } catch {
          return null;
        }
      })
    );
    const ok = opened.filter((x): x is [string, CryptoKey] => x !== null);
    if (ok.length === 0) throw new WrongSecretError();
    addKeys(ok);
  }, []);

  /**
   * Forgotten passphrase: reset it on every vault the recovery code opens, store
   * the re-wrapped records, and unlock them. Notes are untouched.
   */
  const recover = useCallback(
    async (code: string, newPassphrase: string): Promise<void> => {
      const results = await Promise.all(
        ref.current.map(async (v) => {
          try {
            return await resetPassphrase(v, code, newPassphrase);
          } catch {
            return null;
          }
        })
      );
      const ok = results.filter((r): r is NonNullable<typeof r> => r !== null);
      if (ok.length === 0) throw new WrongSecretError();
      await Promise.all(ok.map((r) => putVault(r.record)));
      addKeys(ok.map((r) => [r.record.id, r.key]));
    },
    [putVault]
  );

  /** The vault a NEW lock should use: the oldest one this session has open. */
  const primaryKid = useCallback((): string | null => {
    const open = new Set(unlockedKids());
    return ref.current.find((v) => open.has(v.id))?.id ?? null;
  }, []);

  return {
    vaults,
    hydrated,
    // Until the cloud answers, a vault set up on another device may be on its
    // way; setting up a second one meanwhile would split the locked notes.
    ready: hydrated && (!canSync || cloudLoaded),
    putVault,
    unlock,
    recover,
    primaryKid,
  };
}
