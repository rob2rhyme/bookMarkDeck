// Starter tasks for an empty Focus task list — the counterpart of Habits'
// templates. Tasks are reusable buckets the timer logs time against, so these
// are kinds of work, not one-off to-dos.

export type StarterTaskGroup = { name: string; emoji: string; tasks: string[] };

export const STARTER_TASK_GROUPS: StarterTaskGroup[] = [
  { name: "Deep work", emoji: "🎯", tasks: ["Writing", "Coding", "Design", "Research"] },
  { name: "Communication", emoji: "💬", tasks: ["Email & messages", "Meeting prep", "Calls"] },
  { name: "Planning & admin", emoji: "🗂️", tasks: ["Plan the week", "Bills & paperwork", "Tidy inbox"] },
  { name: "Growth", emoji: "🌱", tasks: ["Reading", "Study", "Practice"] },
];

/** The picked tasks in the groups' order, minus any already on the list (case-insensitive). */
export function planStarterTasks(picked: string[], existing: string[]): string[] {
  const have = new Set(existing.map((t) => t.trim().toLowerCase()));
  const chosen = new Set(picked);
  return STARTER_TASK_GROUPS.flatMap((g) => g.tasks).filter(
    (t) => chosen.has(t) && !have.has(t.toLowerCase())
  );
}
