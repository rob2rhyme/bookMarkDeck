"use client";

import { Modal } from "@/components/Modal";
import { type CursorStyle, useCursorSettings } from "@/lib/cursorSettings";

const STYLES: { value: CursorStyle; label: string }[] = [
  { value: "fish", label: "🐟 Fish" },
  { value: "turtle", label: "🐢 Turtle" },
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

// Auto-or-custom hue picker, reused for body / fins / antennae. With the
// optional jelly toggle it gains a third "Jelly" (translucent) mode.
function HueControl({
  value,
  onChange,
  jelly,
  onJelly,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  jelly?: boolean;
  onJelly?: (b: boolean) => void;
}) {
  const pill = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
        : "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100"
    }`;
  const isJelly = Boolean(jelly);
  const mode = isJelly ? "jelly" : value === null ? "auto" : "custom";
  const swatchHue = value ?? 270;
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={mode === "auto"}
          onClick={() => {
            onChange(null);
            onJelly?.(false);
          }}
          className={pill(mode === "auto")}
        >
          Auto
        </button>
        <button
          type="button"
          aria-pressed={mode === "custom"}
          onClick={() => {
            onChange(value ?? 200);
            onJelly?.(false);
          }}
          className={pill(mode === "custom")}
        >
          Custom
        </button>
        {onJelly && (
          <button
            type="button"
            aria-pressed={mode === "jelly"}
            onClick={() => onJelly(true)}
            className={pill(mode === "jelly")}
          >
            Jelly
          </button>
        )}
        {/* Live swatch of the currently picked colour. */}
        <span
          className="ml-auto h-7 w-7 shrink-0 rounded-full border border-slate-600"
          style={{
            background: `hsl(${swatchHue}, ${isJelly ? 75 : 80}%, ${
              isJelly ? 65 : 55
            }%)`,
            opacity: mode === "auto" ? 0.45 : isJelly ? 0.6 : 1,
          }}
          aria-hidden="true"
        />
      </div>
      {/* Live colour bar — always visible. Dragging it picks a colour (and
          switches Auto → Custom). */}
      <input
        type="range"
        min={0}
        max={360}
        step={1}
        value={swatchHue}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Hue"
        className="hue-slider mt-3 w-full"
        style={{ background: HUE_BAR, borderRadius: 9999 }}
      />
      {mode === "auto" && (
        <p className="mt-1 text-[11px] text-slate-500">
          Auto-cycles the colour. Drag the bar to pick your own.
        </p>
      )}
    </>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <span className="text-sm text-slate-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-blue-600" : "bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            checked ? "left-[1.375rem]" : "left-0.5"
          }`}
        />
      </button>
    </div>
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
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="cursor-settings-title"
      panelClassName="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
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
        <div className="flex flex-wrap gap-2">
          {STYLES.map((opt) => {
            const active = settings.style === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => update({ style: opt.value })}
                className={`min-w-[84px] flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
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

      <Row
        label={
          settings.style === "turtle"
            ? "Shell colour"
            : settings.style === "fish"
              ? "Body colour"
              : "Colour"
        }
      >
        <HueControl
          value={settings.hue}
          onChange={(v) => update({ hue: v })}
          {...(settings.style === "turtle"
            ? {
                jelly: settings.jelly,
                onJelly: (b: boolean) => update({ jelly: b }),
              }
            : {})}
        />
      </Row>

      {settings.style === "fish" && (
        <>
          <Row label={`Fins & tail — ${Math.round(settings.finSize * 100)}%`}>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={settings.finSize}
              onChange={(e) => update({ finSize: Number(e.target.value) })}
              aria-label="Fin size"
              className="w-full accent-blue-500"
            />
            <div className="mt-3">
              <HueControl
                value={settings.finHue}
                onChange={(v) => update({ finHue: v })}
              />
            </div>
          </Row>
          <Row label={`Antennae — ${Math.round(settings.antennaSize * 100)}%`}>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={settings.antennaSize}
              onChange={(e) => update({ antennaSize: Number(e.target.value) })}
              aria-label="Antenna size"
              className="w-full accent-blue-500"
            />
            <div className="mt-3">
              <HueControl
                value={settings.antennaHue}
                onChange={(v) => update({ antennaHue: v })}
              />
            </div>
          </Row>
          <Row label="Eye blink speed">
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={settings.blinkSpeed}
              onChange={(e) => update({ blinkSpeed: Number(e.target.value) })}
              aria-label="Eye blink speed"
              className="w-full accent-blue-500"
            />
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>Slow</span>
              <span>Fast</span>
            </div>
          </Row>
        </>
      )}

      {settings.style === "turtle" && (
        <>
          <Row label={`Flippers — ${Math.round(settings.finSize * 100)}%`}>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={settings.finSize}
              onChange={(e) => update({ finSize: Number(e.target.value) })}
              aria-label="Flipper size"
              className="w-full accent-blue-500"
            />
            <div className="mt-3">
              <HueControl
                value={settings.finHue}
                onChange={(v) => update({ finHue: v })}
              />
            </div>
          </Row>
          <Row label="Shell pattern colour">
            <HueControl
              value={settings.antennaHue}
              onChange={(v) => update({ antennaHue: v })}
            />
          </Row>
          <Row label="Eye blink speed">
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={settings.blinkSpeed}
              onChange={(e) => update({ blinkSpeed: Number(e.target.value) })}
              aria-label="Eye blink speed"
              className="w-full accent-blue-500"
            />
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>Slow</span>
              <span>Fast</span>
            </div>
          </Row>
          <Row label="Swim speed">
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={settings.swimSpeed ?? 1}
              onChange={(e) => update({ swimSpeed: Number(e.target.value) })}
              aria-label="Swim speed"
              className="w-full accent-blue-500"
            />
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>Slow</span>
              <span>Fast</span>
            </div>
          </Row>
          <Row label="Motion & water">
            <Toggle
              label="Float (idle drift + free spin)"
              checked={settings.float}
              onChange={(v) => update({ float: v })}
            />
            <Toggle
              label="Ripples"
              checked={settings.ripples}
              onChange={(v) => update({ ripples: v })}
            />
            <Toggle
              label="Bubbles"
              checked={settings.bubbles}
              onChange={(v) => update({ bubbles: v })}
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
