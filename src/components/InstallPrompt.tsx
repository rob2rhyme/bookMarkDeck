"use client";

import { useEffect, useState } from "react";

import { X } from "@/components/icons";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "bd-install-dismissed";

/**
 * "Install app" affordance. On Chromium (desktop/Android) it appears when the
 * browser fires `beforeinstallprompt`. On iOS Safari (no such event) it shows a
 * one-line Add-to-Home-Screen hint. All browser/UA checks run after mount.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    try {
      if (window.localStorage.getItem(DISMISS_KEY)) return;
    } catch {}

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const ua = window.navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|chrome|android/i.test(ua);
    if (isIOS && isSafari) {
      setIosHint(true);
      setHidden(false);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden || (!deferred && !iosHint)) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  };

  return (
    <div className="fixed bottom-6 left-6 z-[70] max-w-xs rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-lg shadow-black/30 backdrop-blur">
      <div className="flex items-start gap-2">
        <div className="flex-1 text-sm text-slate-200">
          {deferred ? (
            <>
              <p className="font-medium">Install Bookmark Deck</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Add it to your device for quick, full-screen access.
              </p>
              <button
                type="button"
                onClick={install}
                className="mt-2 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
              >
                Install
              </button>
            </>
          ) : (
            <>
              <p className="font-medium">Add to Home Screen</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Tap the Share icon, then “Add to Home Screen.”
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-slate-500 transition hover:text-slate-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
