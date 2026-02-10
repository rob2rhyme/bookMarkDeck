//src/types/shortcut.ts

export type ShortcutApp = {
  id: string;
  name: string;
  url: string;
  icon?: string;
  localPath?: string;
  bundleId?: string;
  appUserModelId?: string;
};
