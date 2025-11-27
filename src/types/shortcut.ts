//src/types/shortcut.ts

export type ShortcutApp = {
  id: string;
  name: string;
  url: string;
  icon?: string;
  platform?: "web" | "mac" | "windows" | "both";
};
