"use client";

import { useState } from "react";

// Starts a Lemon Squeezy checkout and redirects to it. Presentational — callers
// decide when to show it (typically when billing is configured and !pro).
export function UpgradeButton({
  className,
  label = "Upgrade to Premium",
  role,
}: {
  className?: string;
  label?: string;
  role?: string;
}) {
  const [loading, setLoading] = useState(false);

  const go = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (data?.url) {
        window.location.href = data.url;
        return; // navigating away; keep the spinner
      }
    } catch {
      /* fall through to re-enable */
    }
    setLoading(false);
  };

  return (
    <button
      type="button"
      role={role}
      onClick={go}
      disabled={loading}
      className={
        className ??
        "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
      }
    >
      {loading ? "Opening checkout…" : label}
    </button>
  );
}
