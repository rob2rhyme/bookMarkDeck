"use client";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

type HydrationTrackerProps = {
  cups: number;
  oz: number;
  goal: number;
  goalOz: number;
  reminding: boolean;
  onDrink: () => void;
  onRemove: () => void;
  onDismiss: () => void;
};

/**
 * A glass-shaped container whose water level reflects cups / goal. The surface
 * rides up as cups are added (transition on the group's transform) and ripples
 * via two looping SMIL wave layers. Empty glass when fill is 0.
 */
function WaterGlass({ fill }: { fill: number }) {
  // Surface sits at y=18 when full, y=146 when empty (128px of travel).
  const offset = (1 - Math.min(1, Math.max(0, fill))) * 128;
  const reducedMotion = usePrefersReducedMotion();

  return (
    <svg
      viewBox="0 0 120 160"
      className="h-40 w-32"
      role="img"
      aria-label={`Glass ${Math.round(fill * 100)}% full`}
    >
      <defs>
        <clipPath id="hydration-glass-clip">
          <path d="M30 18 L90 18 L82 142 Q81 148 75 148 L45 148 Q39 148 38 142 Z" />
        </clipPath>
      </defs>

      {/* water (clipped to the glass interior) */}
      <g clipPath="url(#hydration-glass-clip)">
        <g
          className={reducedMotion ? undefined : "transition-transform duration-700 ease-out"}
          transform={`translate(0 ${offset})`}
        >
          <path
            d="M-40 22 q 20 -6 40 0 q 20 6 40 0 q 20 -6 40 0 q 20 6 40 0 q 20 -6 40 0 L 200 200 L -40 200 Z"
            className="fill-sky-500/40"
          >
            {!reducedMotion && (
              <animateTransform
                attributeName="transform"
                type="translate"
                from="0 0"
                to="-80 0"
                dur="3.4s"
                repeatCount="indefinite"
              />
            )}
          </path>
          <path
            d="M-40 18 q 20 -5 40 0 q 20 5 40 0 q 20 -5 40 0 q 20 5 40 0 q 20 -5 40 0 L 200 200 L -40 200 Z"
            className="fill-sky-500/80"
          >
            {!reducedMotion && (
              <animateTransform
                attributeName="transform"
                type="translate"
                from="-80 0"
                to="0 0"
                dur="2.4s"
                repeatCount="indefinite"
              />
            )}
          </path>
        </g>
      </g>

      {/* glass outline */}
      <path
        d="M30 18 L90 18 L82 142 Q81 148 75 148 L45 148 Q39 148 38 142 Z"
        fill="none"
        strokeWidth="2"
        strokeLinejoin="round"
        className={fill > 0 ? "stroke-sky-300/80" : "stroke-slate-600"}
      />
    </svg>
  );
}

export function HydrationTracker({
  cups,
  oz,
  goal,
  goalOz,
  reminding,
  onDrink,
  onRemove,
  onDismiss,
}: HydrationTrackerProps) {
  const reached = cups >= goal;
  const fill = goal > 0 ? cups / goal : 0;

  return (
    <section
      className={`rounded-2xl border p-6 shadow-sm transition sm:p-8 ${
        reminding
          ? "border-sky-500/60 bg-sky-950/30"
          : "border-slate-800/70 bg-slate-900/85"
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Hydration
        </h3>
        <span
          className={`text-sm font-medium tabular-nums ${
            reached ? "text-emerald-300" : "text-slate-400"
          }`}
        >
          {cups} / {goal} cups
        </span>
      </div>

      {reminding && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-slate-950/50 px-3 py-2">
          <span className="text-sm text-sky-300">💧 Time to drink a cup</span>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-slate-400 transition hover:text-slate-200"
          >
            Snooze
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-col items-center gap-1">
        <WaterGlass fill={fill} />
        <p className="text-sm tabular-nums text-slate-300">
          <span className="font-semibold text-sky-300">{cups}</span>{" "}
          {cups === 1 ? "cup" : "cups"}
          <span className="text-slate-500"> · {oz} oz</span>
        </p>
        <p className="text-xs tabular-nums text-slate-500">
          Goal: {goal} cups · {goalOz} oz
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onDrink}
          className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
        >
          + Drink a cup
        </button>
        {cups > 0 && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove a cup"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
          >
            −
          </button>
        )}
      </div>

      {reached && (
        <p className="mt-3 text-sm font-medium text-emerald-300">
          ✓ Daily goal reached — well hydrated!
        </p>
      )}
    </section>
  );
}

export default HydrationTracker;
