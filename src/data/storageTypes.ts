// Shared contract for the platform-split storage adapters
// (storage.ts = native SQLite, storage.web.ts = localStorage).

export type CollectionName = "items" | "wishlist" | "locations";

export type AppSettings = {
  themeMode?: "system" | "dark" | "light";
  seededRooms?: boolean;
};

export const SETTINGS_KEY = "settings";

export function parseRows<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function parseSettings(raw: string | null | undefined): AppSettings {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as AppSettings) : {};
  } catch {
    return {};
  }
}
