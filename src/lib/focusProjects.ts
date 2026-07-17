// Pure reader for the Focus pillar's project labels, so an inventory item can be
// tied to a Focus project. A "project" there isn't a first-class record — it's a
// reusable label string on project-list to-dos (see features/focus/lib/types.ts
// Todo.project). We only ever READ it; the inventory feature never writes focus
// data. No React/Firebase here — see focusProjects.test.ts.

/**
 * Distinct, sorted project labels found on the user's project-list to-dos.
 * Defensive against any shape (raw parsed JSON): non-objects, personal/legacy
 * items, and blank labels are skipped. Case-insensitive de-dupe keeps the first
 * spelling seen.
 */
export function distinctProjects(todos: unknown): string[] {
  if (!Array.isArray(todos)) return [];
  const byLower = new Map<string, string>();
  for (const t of todos) {
    if (!t || typeof t !== "object") continue;
    const rec = t as { list?: unknown; project?: unknown };
    // Only project-list to-dos carry a project label; legacy items omit `list`
    // and default to "personal".
    if (rec.list !== "project") continue;
    const name = typeof rec.project === "string" ? rec.project.trim() : "";
    if (name && !byLower.has(name.toLowerCase())) byLower.set(name.toLowerCase(), name);
  }
  return [...byLower.values()].sort((a, b) => a.localeCompare(b));
}
