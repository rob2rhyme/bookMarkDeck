// Web storage: localStorage, mirroring the native SQLite kv adapter.

import {
  parseRows,
  parseSettings,
  SETTINGS_KEY,
  type AppSettings,
  type CollectionName,
} from "@/data/storageTypes";

const PREFIX = "everhold:v1:";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Quota or privacy mode — state stays in memory; next save retries.
  }
}

export async function loadCollection<T>(name: CollectionName): Promise<T[]> {
  return parseRows<T>(read(name));
}

export async function saveCollection<T>(
  name: CollectionName,
  rows: T[]
): Promise<void> {
  write(name, JSON.stringify(rows));
}

export async function loadSettings(): Promise<AppSettings> {
  return parseSettings(read(SETTINGS_KEY));
}

export async function saveSettings(patch: AppSettings): Promise<void> {
  const current = parseSettings(read(SETTINGS_KEY));
  write(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
}
