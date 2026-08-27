// Turning a place id into the line a person can act on:
// "Garage › Grey cabinet › Drawer 2". This is the pillar's whole promise, so it
// lives in one tested place. Pure — see breadcrumb.test.ts.

import type { FilingFolder, FilingPlace } from "@/features/filing/lib/types";

export const CRUMB_SEP = " › ";

/**
 * For every place, its full root→leaf breadcrumb of names. Missing parents stop
 * the walk; a cycle is broken defensively so we never loop.
 */
export function placePathsById(places: FilingPlace[]): Record<string, string[]> {
  const byId = new Map(places.map((p) => [p.id, p]));
  const cache: Record<string, string[]> = {};
  const build = (id: string, seen: Set<string>): string[] => {
    if (cache[id]) return cache[id];
    const place = byId.get(id);
    if (!place) return [];
    if (seen.has(id)) return [place.name]; // cycle guard
    seen.add(id);
    const path = [...(place.parentId ? build(place.parentId, seen) : []), place.name];
    cache[id] = path;
    return path;
  };
  const result: Record<string, string[]> = {};
  for (const p of places) result[p.id] = build(p.id, new Set());
  return result;
}

/** Render a path for display. Empty path → a caller-supplied fallback. */
export function formatPath(path: string[], fallback = "No place set"): string {
  return path.length ? path.join(CRUMB_SEP) : fallback;
}

/**
 * The full answer to "where is this paper?" — the folder's place breadcrumb with
 * the folder itself appended, so the last hop is the thing you actually pull.
 *
 * Uses the folder's CURRENT place, not its home: if it has been taken out, the
 * honest answer is where it is now, not where it belongs.
 */
export function folderTrail(
  folder: Pick<FilingFolder, "name" | "homePlaceId" | "currentPlaceId">,
  paths: Record<string, string[]>
): string[] {
  const placeId = folder.currentPlaceId ?? folder.homePlaceId;
  const base = placeId ? paths[placeId] ?? [] : [];
  return [...base, folder.name];
}

/** True when the folder is somewhere other than where it lives. */
export function isCheckedOut(
  folder: Pick<FilingFolder, "homePlaceId" | "currentPlaceId">
): boolean {
  const home = folder.homePlaceId ?? null;
  const current = folder.currentPlaceId ?? null;
  // A folder with no current place recorded is simply at home.
  if (current === null) return false;
  return current !== home;
}
