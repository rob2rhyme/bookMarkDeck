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
 * rides up as cups are added (transition on the group's transform); a gradient
 * "crystal clear" body, a glossy meniscus, two parallax SMIL wave layers, and
 * rising bubbles give it life. Empty glass when fill is 0. Motion is gated by
 * prefers-reduced-motion.
 */
function WaterGlass({ fill }: { fill: number }) {
  // Surface sits at y=18 when full, y=146 when empty (128px of travel).
  const offset = (1 - Math.min(1, Math.max(0, fill))) * 128;
  const reducedMotion = usePrefersReducedMotion();

  return (
    <svg
      viewBox="0 0 120 160"
      className="h-56 w-44"
      role="img"
      aria-label={`Glass ${Math.round(fill * 100)}% full`}
    >
      <defs>
        <clipPath id="hydration-glass-clip">
          <path d="M30 18 L90 18 L82 142 Q81 148 75 148 L45 148 Q39 148 38 142 Z" />
        </clipPath>
        {/* clear-water body: bright near the surface, deeper toward the base */}
        <linearGradient id="hydration-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.9" />
        </linearGradient>
        {/* soft reflection running down the left wall of the glass */}
        <linearGradient id="hydration-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="24%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* water (clipped to the glass interior) */}
      <g clipPath="url(#hydration-glass-clip)">
        <g
          className={reducedMotion ? undefined : "transition-transform duration-700 ease-out"}
          transform={`translate(0 ${offset})`}
        >
          {/* back wave — faint, slower parallax for depth */}
          <path
            d="M-40 22 q 20 -6 40 0 q 20 6 40 0 q 20 -6 40 0 q 20 6 40 0 q 20 -6 40 0 L 200 200 L -40 200 Z"
            fill="#7dd3fc"
            fillOpacity="0.3"
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
          {/* front wave — the clear-water body */}
          <path
            d="M-40 18 q 20 -5 40 0 q 20 5 40 0 q 20 -5 40 0 q 20 5 40 0 q 20 -5 40 0 L 200 200 L -40 200 Z"
            fill="url(#hydration-water)"
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
          {/* glossy meniscus riding the surface */}
          <path
            d="M-40 18 q 20 -5 40 0 q 20 5 40 0 q 20 -5 40 0 q 20 5 40 0 q 20 -5 40 0"
            fill="none"
            stroke="#e0f7ff"
            strokeOpacity="0.75"
            strokeWidth="1.4"
            strokeLinecap="round"
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

          {/* rising bubbles — coordinates are in the water group so they track
              the surface; only shown once there's a real body of water */}
          {!reducedMotion && fill >= 0.4 && (
            <g fill="#e0f7ff">
              <circle cx="51" cy="118" r="1.6">
                <animate attributeName="cy" from="118" to="42" dur="3.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.7;0" dur="3.6s" repeatCount="indefinite" />
              </circle>
              <circle cx="66" cy="116" r="1.1">
                <animate attributeName="cy" from="116" to="46" dur="4.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.6;0" dur="4.8s" repeatCount="indefinite" />
              </circle>
              <circle cx="58" cy="120" r="0.9">
                <animate attributeName="cy" from="120" to="40" dur="5.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.55;0" dur="5.6s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
        </g>
      </g>

      {/* glass reflection sheen */}
      <path
        d="M30 18 L90 18 L82 142 Q81 148 75 148 L45 148 Q39 148 38 142 Z"
        fill="url(#hydration-sheen)"
      />

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

      <div className="mt-6 flex flex-col items-center gap-2">
        <WaterGlass fill={fill} />
        <p className="text-lg tabular-nums text-slate-200">
          <span className="text-2xl font-semibold text-sky-300">{cups}</span>{" "}
          {cups === 1 ? "cup" : "cups"}
          <span className="text-slate-500"> · {oz} oz</span>
        </p>
        <p className="text-sm tabular-nums text-slate-500">
          Goal: {goal} cups · {goalOz} oz
        </p>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onDrink}
          className="flex-1 rounded-lg bg-sky-600 px-4 py-3 text-base font-medium text-white transition hover:bg-sky-500"
        >
          + Drink a cup
        </button>
        {cups > 0 && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove a cup"
            className="rounded-lg border border-slate-700 px-4 py-3 text-base text-slate-300 transition hover:border-slate-500"
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
