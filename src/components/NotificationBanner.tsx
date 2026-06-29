"use client";

// Contextual notification-permission nudge. Only appears on the Focus hub
// (where end-of-block alerts matter), only while permission is still "default",
// and — by design — at most ONCE ever: it's marked seen the first time it shows
// (cloud-backed via uiPrefs, so it survives cache eviction and other devices),
// whatever the user then does with the OS prompt.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { fetchUiFlag, getCachedFlag, markUiFlag } from "@/lib/uiPrefs";

export function NotificationBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (!(pathname?.startsWith("/focus") ?? false)) return;
    if (Notification.permission !== "default") return;
    if (getCachedFlag("notifBannerSeen")) return; // already nudged on this device
    let cancelled = false;
    // Confirm against the cloud before the one-shot, so a returning user whose
    // localStorage was evicted isn't nudged a second time.
    fetchUiFlag("notifBannerSeen").then((seen) => {
      if (cancelled || seen) return;
      setVisible(true);
      // Remember immediately — first appearance only, regardless of the choice.
      markUiFlag("notifBannerSeen");
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!visible) return null;

  const enable = () => {
    try {
      Notification.requestPermission().finally(() => setVisible(false));
    } catch {
      setVisible(false);
    }
  };

  const dismiss = () => setVisible(false);

  return (
    <div className="fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 sm:bottom-6">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/95 px-4 py-3 shadow-lg backdrop-blur">
        <span className="text-lg" aria-hidden="true">
          🔔
        </span>
        <p className="min-w-0 flex-1 text-[13px] text-slate-300">
          Get alerted when a focus block ends, even in another tab.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={enable}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
          >
            Enable
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-slate-500 transition hover:text-slate-300"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export default NotificationBanner;
