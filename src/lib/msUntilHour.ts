/**
 * Milliseconds until the next occurrence of `hour` local time. Always strictly
 * in the future: at exactly the hour, the next one is tomorrow, so re-arming
 * during a digest's own hour can't schedule a message in the past.
 */
export function msUntilHour(now: Date, hour: number): number {
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}
