import * as SQLite from "expo-sqlite";

import type { KeyValueStore } from "./repo";

// expo-sqlite backing for the KeyValueStore port.
//
// SQLite (not AsyncStorage) because it is the migration target: when collections
// outgrow whole-blob reads, this file becomes a real table-per-collection store
// without the repository or any screen changing. Today it holds one JSON blob
// per collection, which is plenty at the scale a single household reaches.

const DB_NAME = "mystuff.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`
      );
      return db;
    })();
  }
  return dbPromise;
}

export function createSqliteStore(): KeyValueStore {
  return {
    async get(key) {
      const db = await getDb();
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM kv WHERE key = ?",
        key
      );
      return row?.value ?? null;
    },
    async set(key, value) {
      const db = await getDb();
      await db.runAsync(
        "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        key,
        value
      );
    },
  };
}
