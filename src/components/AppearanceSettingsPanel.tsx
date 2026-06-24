"use client";

import { useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { Bookmark } from "@/components/icons";
import {
  type FontFamily,
  useAppearanceSettings,
} from "@/lib/appearanceSettings";

// System-only stacks. Each renders in its own face so the label previews it.
const FONTS: { value: FontFamily; label: string }[] = [
  { value: "system", label: "Aa System" },
  { value: "serif", label: "Aa Serif" },
  { value: "mono", label: "Aa Mono" },
  { value: "rounded", label: "Aa Rounded" },
  { value: "classic", label: "Aa Classic" },
  { value: "elegant", label: "Aa Elegant" },
  { value: "slab", label: "Aa Slab" },
  { value: "humanist", label: "Aa Humanist" },
  { value: "handwritten", label: "Aa Script" },
  { value: "typewriter", label: "Aa Type" },
  { value: "display", label: "Aa Display" },
];

const PILL_BASE =
  "min-w-[84px] flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition";
const pillClass = (active: boolean) =>
  `${PILL_BASE} ${
    active
      ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
      : "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100"
  }`;

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      {children}
    </div>
  );
}

export function AppearanceSettingsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    settings,
    update,
    reset,
    customFont,
    setCustomFont,
    clearCustomFont,
  } = useAppearanceSettings();

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fontBusy, setFontBusy] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);

  async function onFontFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setFontError(null);
    setFontBusy(true);
    try {
      await setCustomFont(file);
    } catch (err) {
      setFontError(err instanceof Error ? err.message : "Couldn't load that font.");
    } finally {
      setFontBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="appearance-settings-title"
      panelClassName="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2
        id="appearance-settings-title"
        className="text-lg font-semibold tracking-tight text-slate-50"
      >
        Appearance
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        Font and sizing for the whole app. System fonts only — saved on this
        device.
      </p>

      <Row label="Font">
        <div className="flex flex-wrap gap-2">
          {FONTS.map((opt) => {
            const active = settings.fontFamily === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => update({ fontFamily: opt.value })}
                style={{ fontFamily: `var(--app-font-${opt.value})` }}
                className={pillClass(active)}
              >
                {opt.label}
              </button>
            );
          })}
          {customFont && (
            <button
              type="button"
              aria-pressed={settings.fontFamily === "custom"}
              onClick={() => update({ fontFamily: "custom" })}
              style={{ fontFamily: "var(--app-font-custom)" }}
              className={pillClass(settings.fontFamily === "custom")}
              title={customFont.name}
            >
              <span className="block max-w-[120px] truncate">
                {customFont.name}
              </span>
            </button>
          )}
        </div>
      </Row>

      <Row label="Custom font">
        {customFont && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-slate-700 px-3 py-2">
            <span
              className="min-w-0 flex-1 truncate text-sm text-slate-200"
              style={{ fontFamily: "var(--app-font-custom)" }}
            >
              {customFont.name}
            </span>
            <button
              type="button"
              onClick={() => {
                setFontError(null);
                clearCustomFont();
              }}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-red-300"
            >
              Remove
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={fontBusy}
          className="w-full rounded-lg border border-dashed border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100 disabled:opacity-60"
        >
          {fontBusy
            ? "Loading…"
            : customFont
              ? "Replace font…"
              : "Upload a font…"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/*"
          onChange={onFontFile}
          className="hidden"
        />
        {fontError && (
          <p className="mt-2 text-[12px] text-red-300">{fontError}</p>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          .ttf, .otf, .woff or .woff2 · up to 2&nbsp;MB · stays on this device
          (never uploaded).
        </p>
      </Row>

      <Row label={`Text size — ${Math.round(settings.fontScale * 100)}%`}>
        <input
          type="range"
          min={0.85}
          max={1.4}
          step={0.05}
          value={settings.fontScale}
          onChange={(e) => update({ fontScale: Number(e.target.value) })}
          aria-label="Text size"
          className="w-full accent-blue-500"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>Smaller</span>
          <span>Larger</span>
        </div>
        <p
          className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-slate-200"
          style={{ fontFamily: `var(--app-font-${settings.fontFamily})` }}
        >
          The quick brown fox jumps over the lazy dog.
        </p>
      </Row>

      <Row label={`Emoji size — ${Math.round(settings.emojiScale * 100)}%`}>
        <input
          type="range"
          min={0.75}
          max={1.75}
          step={0.05}
          value={settings.emojiScale}
          onChange={(e) => update({ emojiScale: Number(e.target.value) })}
          aria-label="Emoji size"
          className="w-full accent-blue-500"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>Smaller</span>
          <span>Larger</span>
        </div>
      </Row>

      <Row label={`Icon size — ${Math.round(settings.iconScale * 100)}%`}>
        <input
          type="range"
          min={0.75}
          max={1.75}
          step={0.05}
          value={settings.iconScale}
          onChange={(e) => update({ iconScale: Number(e.target.value) })}
          aria-label="Icon size"
          className="w-full accent-blue-500"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>Smaller</span>
          <span>Larger</span>
        </div>
      </Row>

      {/* Live preview of the emoji + icon multipliers together. The icon sizes
          from its 1.25rem font-size context (× the icon multiplier inline). */}
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-slate-200">
        <span
          aria-hidden="true"
          style={{ fontSize: "calc(1.25rem * var(--app-emoji-scale, 1))" }}
        >
          🔖
        </span>
        <span
          className="flex items-center text-blue-300"
          style={{ fontSize: "1.25rem" }}
        >
          <Bookmark />
        </span>
        <span className="text-[13px] text-slate-400">Emoji &amp; icon preview</span>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
        >
          Reset to defaults
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

export default AppearanceSettingsPanel;
