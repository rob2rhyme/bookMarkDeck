//src/components/ShortcutCard.tsx
"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { Emoji } from "@/components/icons";
import { ShortcutApp } from "@/types/shortcut";
import { launcherHealth, launcherOpen } from "@/utils/launcherClient";

function getFaviconUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname;
    if (!host || !host.includes(".")) return null;
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(
      host
    )}`;
  } catch {
    // Retry for entries missing protocol (e.g., "mail.google.com")
    try {
      const url = new URL(`https://${rawUrl}`);
      const host = url.hostname;
      if (!host || !host.includes(".")) return null;
      return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(
        host
      )}`;
    } catch {
      return null;
    }
  }
}

type Props = {
  app: ShortcutApp;
  onDelete?: (id: string) => void;
  onEdit?: (app: ShortcutApp) => void;
};

function firstLetterFromUrlOrName(url: string, name: string): string {
  const extract = (value: string) => {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.replace(/^www\./i, "");
      return host[0]?.toUpperCase() ?? "";
    } catch {
      return "";
    }
  };
  const fromUrl = extract(url) || extract(`https://${url}`);
  if (fromUrl) return fromUrl;
  return name.trim()[0]?.toUpperCase() ?? "A";
}

export function ShortcutCard({ app, onDelete, onEdit }: Props) {
  const favicon = getFaviconUrl(app.url);
  const iconIsUrl =
    typeof app.icon === "string" &&
    (app.icon.startsWith("http://") || app.icon.startsWith("https://"));
  const initial = firstLetterFromUrlOrName(app.url, app.name);
  const [iconLoadErrorFor, setIconLoadErrorFor] = useState<string | null>(null);
  const iconUrl = iconIsUrl ? app.icon : favicon;
  const iconLoadError = iconUrl ? iconLoadErrorFor === iconUrl : false;
  const hostname = useMemo(() => {
    try {
      return new URL(app.url).hostname;
    } catch {
      return app.url;
    }
  }, [app.url]);

  const handleOpen = async () => {
    const hasNativeTarget =
      Boolean(app.localPath?.trim()) ||
      Boolean(app.bundleId?.trim()) ||
      Boolean(app.appUserModelId?.trim());

    if (hasNativeTarget) {
      const healthy = await launcherHealth();
      if (!healthy) {
        alert("Launcher not reachable. Start the local launcher and try again.");
        return;
      }
      try {
        await launcherOpen({
          localPath: app.localPath?.trim() || undefined,
          bundleId: app.bundleId?.trim() || undefined,
          appUserModelId: app.appUserModelId?.trim() || undefined,
        });
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to open native app.");
      }
      return;
    }

    const target = app.url.trim();
    if (!target) return;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="group relative flex h-full min-h-[88px] flex-nowrap items-center justify-between gap-4 rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-500/50 hover:bg-slate-900">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex h-12 w-12 min-w-[48px] items-center justify-center overflow-hidden rounded bg-slate-100 text-xl text-white ring-1 ring-white/5">
          {iconUrl && !iconLoadError ? (
            <img
              src={iconUrl}
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
              loading="lazy"
              onError={() => {
                if (iconUrl) setIconLoadErrorFor(iconUrl);
              }}
            />
          ) : app.icon ? (
            <Emoji>{app.icon}</Emoji>
          ) : (
            <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-100">
              {initial}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base font-semibold text-slate-100 leading-tight">
            {app.name}
          </span>
          <span className="truncate text-[12px] text-slate-400">
            {hostname}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-nowrap items-center gap-3">
        <button
          type="button"
          onClick={handleOpen}
          className="shrink-0 whitespace-nowrap rounded-full bg-blue-600/90 px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition group-hover:bg-blue-500"
        >
          Open
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(app)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-base text-slate-200 transition hover:border-blue-400 hover:text-white"
            aria-label={`Edit ${app.name}`}
          >
            ✏️
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(app.id)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-base text-slate-300 transition hover:border-red-400 hover:bg-red-900/60 hover:text-white"
            aria-label={`Delete ${app.name}`}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
