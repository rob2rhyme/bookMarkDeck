export function hapticTap(): void {
  if (typeof navigator === "undefined") return;
  if (typeof window === "undefined") return;
  if (!("vibrate" in navigator)) return;
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  navigator.vibrate(10);
}
