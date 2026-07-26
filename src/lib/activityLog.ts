// Unified per-user activity timeline (users/{uid}/activity) — shared cross-pillar
// infrastructure written by Focus, Habits, and My Stuff. Lives in @/lib (not
// under any one feature) so no feature has to import another just to log an
// event. (Decoupling step C3, MYSTUFF-DECOUPLING-READINESS.md.)

import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";

export type ActivityType =
  | "focus"
  | "task_added"
  | "task_done"
  | "mood"
  | "journal"
  | "dream"
  | "hydration"
  | "todo_added"
  | "todo_done"
  | "habit_done"
  | "habit_skipped"
  | "bookmark"
  | "quiz"
  | "meditation"
  | "reset"
  // My Stuff (inventory) moments — logged by the inventory feature.
  | "item_added"
  | "item_lent"
  | "item_returned"
  | "item_released";

const activityCol = (uid: string) => collection(db, "users", uid, "activity");

/** Append one event to the unified activity timeline. Fire-and-forget. */
export async function logActivity(
  emailHint: string,
  type: ActivityType,
  summary: string,
  day: string
): Promise<void> {
  const user = await ensureFirebaseGoogleAuth(emailHint);
  const id = crypto.randomUUID();
  await setDoc(doc(activityCol(user.uid), id), {
    type,
    summary,
    day,
    createdAt: serverTimestamp(),
  });
}
