// Starter rooms for onboarding — a calm one-tap seed so a brand-new My Stuff
// (no locations yet) is never a blank page. Deliberately a short, common set;
// people rename/nest from here. Pure + unit-tested.

export const STARTER_ROOMS = [
  "Living room",
  "Kitchen",
  "Bedroom",
  "Bathroom",
  "Home office",
  "Garage",
  "Storage",
  "Outdoors",
] as const;

/**
 * The starter rooms not already present (case-insensitive, trimmed) — so a
 * re-seed after a partial setup never creates duplicates.
 */
export function missingStarterRooms(existingNames: string[]): string[] {
  const have = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  return STARTER_ROOMS.filter((r) => !have.has(r.toLowerCase()));
}
