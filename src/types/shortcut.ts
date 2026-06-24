//src/types/shortcut.ts

export type ShortcutPlatform = "darwin" | "win32" | "linux";

/** Native launch target for a single platform. */
export type PlatformTarget = {
  appPath?: string; // app/executable path on that OS
  bundleId?: string; // macOS bundle identifier
  appUserModelId?: string; // Windows AppUserModelID
};

export type ShortcutApp = {
  id: string;
  name: string;
  url: string;
  icon?: string;
  /** Per-platform native launch targets — synced, so they roam across devices. */
  targets?: Partial<Record<ShortcutPlatform, PlatformTarget>>;
  /** @deprecated legacy flat fields — migrated into `targets` on read. */
  localPath?: string;
  /** @deprecated */
  bundleId?: string;
  /** @deprecated */
  appUserModelId?: string;
};
