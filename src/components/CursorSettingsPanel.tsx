"use client";

import { Modal } from "@/components/Modal";
import { type CursorStyle, useCursorSettings } from "@/lib/cursorSettings";

const STYLES: { value: CursorStyle; label: string }[] = [
  { value: "fish", label: "🐟 Fish" },
  { value: "dragon", label: "🐉 Dragon" },
  { value: "off", label: "○ Off" },
];

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

const HUE_BAR =
  "linear-gradient(to right, hsl(0,80%,55%), hsl(60,80%,55%), hsl(120,80%,55%), hsl(180,80%,55%), hsl(240,80%,55%), hsl(300,80%,55%), hsl(360,80%,55%))";

// Auto-or-custom hue picker, reused for body / fins / antennae.
function HueControl({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const pill = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
        : "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100"
    }`;
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={pill(value === null)}
        >
          Auto
        </button>
        <button
          type="button"
          aria-pressed={value !== null}
          onClick={() => onChange(value ?? 200)}
          className={pill(value !== null)}
        >
          Custom
        </button>
        {value !== null && (
          <span
            className="ml-1 h-7 w-7 shrink-0 rounded-full border border-slate-600"
            style={{ background: `hsl(${value}, 80%, 55%)` }}
            aria-hidden="true"
          />
        )}
      </div>
      {value !== null && (
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Hue"
          className="mt-3 w-full accent-blue-500"
          style={{ background: HUE_BAR, borderRadius: 9999 }}
        />
      )}
    </>
  );
}

export function CursorSettingsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { settings, update, reset } = useCursorSettings();

  return (
    <Modal open={open} onClose={onClose} labelledBy="cursor-settings-title">
      <h2
        id="cursor-settings-title"
        className="text-lg font-semibold tracking-tight text-slate-50"
      >
        Cursor overlay
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        The decorative creature that follows your pointer. Saved on this device.
      </p>

      <Row label="Style">
        <div className="flex gap-2">
          {STYLES.map((opt) => {
            const active = settings.style === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => update({ style: opt.value })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
                    : "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Row>

      <Row label={`Size — ${Math.round(settings.size * 100)}%`}>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.05}
          value={settings.size}
          onChange={(e) => update({ size: Number(e.target.value) })}
          aria-label="Cursor size"
          className="w-full accent-blue-500"
        />
      </Row>

      <Row label={settings.style === "fish" ? "Body colour" : "Colour"}>
        <HueControl value={settings.hue} onChange={(v) => update({ hue: v })} />
      </Row>

      {settings.style === "fish" && (
        <>
          <Row label="Fins & tail colour">
            <HueControl
              value={settings.finHue}
              onChange={(v) => update({ finHue: v })}
            />
          </Row>
          <Row label="Antennae colour">
            <HueControl
              value={settings.antennaHue}
              onChange={(v) => update({ antennaHue: v })}
            />
          </Row>
        </>
      )}

      <Row label="Transition (follow feel)">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.transition}
          onChange={(e) => update({ transition: Number(e.target.value) })}
          aria-label="Cursor follow transition"
          className="w-full accent-blue-500"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>Smooth</span>
          <span>Snappy</span>
        </div>
      </Row>

      <p className="mt-5 text-[11px] text-slate-500">
        Applies to every overlay. Respects reduced-motion (no animation when your
        OS asks for it).
      </p>

      <div className="mt-4 flex gap-2">
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

export default CursorSettingsPanel;
