// Pure helpers for the evening "keep your focus streak" nudge. A push is worth
// scheduling only when there's a streak to protect and no session logged yet
// today — otherwise the day's streak is safe (or already broken). See
// streakNudge.test.ts.

const NUDGE_HOUR = 20; // 8pm local

export function shouldNudgeFocusStreak(
  streak: number,
  todaySessions: number
): boolean {
  return streak >= 2 && todaySessions === 0;
}

/** Evening fire time today (epoch ms), or null if that hour has already passed. */
export function focusStreakNudgeAt(
  now: Date,
  hour = NUDGE_HOUR
): number | null {
  const at = new Date(now);
  at.setHours(hour, 0, 0, 0);
  const ms = at.getTime();
  return ms > now.getTime() ? ms : null;
}

export function focusStreakBody(streak: number): string {
  return `Keep your ${streak}-day focus streak alive — even a short session counts.`;
}
