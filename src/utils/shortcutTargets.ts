// src/utils/shortcutTargets.ts
import {
  PlatformTarget,
  ShortcutApp,
  ShortcutPlatform,
} from "@/types/shortcut";

const PLATFORMS: ShortcutPlatform[] = ["darwin", "win32", "linux"];

/** Best-effort detection of the current desktop OS from the browser. */
export function detectPlatform(): ShortcutPlatform | "other" {
  if (typeof navigator === "undefined") return "other";
  const uaDataPlatform =
    (navigator as unknown as { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? "";
  const haystack = `${uaDataPlatform} ${navigator.platform ?? ""} ${
    navigator.userAgent ?? ""
  }`.toLowerCase();
  if (haystack.includes("win")) return "win32";
  if (haystack.includes("mac")) return "darwin";
  if (haystack.includes("linux") || haystack.includes("x11")) return "linux";
  return "other";
}

/** Trim a platform target; returns undefined when it carries no usable value. */
export function cleanPlatformTarget(
  target: PlatformTarget | undefined | null
): PlatformTarget | undefined {
  if (!target || typeof target !== "object") return undefined;
  const appPath =
    typeof target.appPath === "string" && target.appPath.trim()
      ? target.appPath.trim()
      : undefined;
  const bundleId =
    typeof target.bundleId === "string" && target.bundleId.trim()
      ? target.bundleId.trim()
      : undefined;
  const appUserModelId =
    typeof target.appUserModelId === "string" && target.appUserModelId.trim()
      ? target.appUserModelId.trim()
      : undefined;
  if (!appPath && !bundleId && !appUserModelId) return undefined;
  return {
    ...(appPath ? { appPath } : {}),
    ...(bundleId ? { bundleId } : {}),
    ...(appUserModelId ? { appUserModelId } : {}),
  };
}

/**
 * Build a canonical `targets` map from a raw shortcut, migrating the legacy
 * flat fields (localPath / bundleId / appUserModelId) into per-platform slots.
 */
export function normalizeTargets(
  raw: Partial<ShortcutApp>
): ShortcutApp["targets"] | undefined {
  const out: Partial<Record<ShortcutPlatform, PlatformTarget>> = {};

  if (raw.targets && typeof raw.targets === "object") {
    for (const platform of PLATFORMS) {
      const cleaned = cleanPlatformTarget(raw.targets[platform]);
      if (cleaned) out[platform] = cleaned;
    }
  }

  // Migrate legacy flat fields. bundleId + localPath were macOS-era values;
  // appUserModelId is Windows.
  const legacyMac = cleanPlatformTarget({
    appPath: typeof raw.localPath === "string" ? raw.localPath : undefined,
    bundleId: typeof raw.bundleId === "string" ? raw.bundleId : undefined,
  });
  if (legacyMac && !out.darwin) out.darwin = legacyMac;

  const legacyWin = cleanPlatformTarget({
    appUserModelId:
      typeof raw.appUserModelId === "string" ? raw.appUserModelId : undefined,
  });
  if (legacyWin && !out.win32) out.win32 = legacyWin;

  return Object.keys(out).length ? out : undefined;
}

export function hasAnyNativeTarget(app: ShortcutApp): boolean {
  return Boolean(
    app.targets && PLATFORMS.some((p) => cleanPlatformTarget(app.targets?.[p]))
  );
}

export function targetForPlatform(
  app: ShortcutApp,
  platform: ShortcutPlatform | "other"
): PlatformTarget | undefined {
  if (platform === "other") return undefined;
  return cleanPlatformTarget(app.targets?.[platform]);
}

/** A short human label for a native target (for display when there's no URL). */
export function firstTargetLabel(app: ShortcutApp): string | undefined {
  if (!app.targets) return undefined;
  for (const platform of PLATFORMS) {
    const t = cleanPlatformTarget(app.targets[platform]);
    if (t) return t.bundleId ?? t.appUserModelId ?? t.appPath;
  }
  return undefined;
}
