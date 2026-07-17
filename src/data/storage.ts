// Native storage: one SQLite kv row per collection (expo-sqlite).
// Local-first — every read/write is on-device; sync arrives in Phase 4.

import * as SQLite from "expo-sqlite";

import {
  parseRows,
  parseSettings,
  SETTINGS_KEY,
  type AppSettings,
  type CollectionName,
} from "@/data/storageTypes";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("everhold.db").then(async (d) => {
      await d.execAsync(
        "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)"
      );
      return d;
    });
  }
  return dbPromise;
}

async function readKey(key: string): Promise<string | null> {
  const d = await db();
  const row = await d.getFirstAsync<{ value: string }>(
    "SELECT value FROM kv WHERE key = ?",
    key
  );
  return row?.value ?? null;
}

async function writeKey(key: string, value: string): Promise<void> {
  const d = await db();
  await d.runAsync(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value
  );
}

export async function loadCollection<T>(name: CollectionName): Promise<T[]> {
  try {
    return parseRows<T>(await readKey(name));
  } catch {
    return [];
  }
}

export async function saveCollection<T>(
  name: CollectionName,
  rows: T[]
): Promise<void> {
  try {
    await writeKey(name, JSON.stringify(rows));
  } catch {
    // Local write failed (disk full etc.) — state stays in memory; next save retries.
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    return parseSettings(await readKey(SETTINGS_KEY));
  } catch {
    return {};
  }
}

export async function saveSettings(patch: AppSettings): Promise<void> {
  try {
    const current = parseSettings(await readKey(SETTINGS_KEY));
    await writeKey(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Best-effort, same as saveCollection.
  }
}
