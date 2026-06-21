"use client";

// Contextual notification-permission nudge. Only appears on the Focus hub
// (where end-of-block alerts matter), only while permission is still "default",
// and only until the user enables or dismisses it.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const DISMISS_KEY = "bd:notif-banner-dismissed";

export function NotificationBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const onFocus = pathname?.startsWith("/focus") ?? false;
    const dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    setVisible(onFocus && !dismissed && Notification.permission === "default");
  }, [pathname]);

  if (!visible) return null;

  const enable = () => {
    try {
      Notification.requestPermission().finally(() => setVisible(false));
    } catch {
      setVisible(false);
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

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
