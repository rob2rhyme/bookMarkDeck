"use client";

type HydrationTrackerProps = {
  glasses: number;
  goal: number;
  reminding: boolean;
  onDrink: () => void;
  onRemove: () => void;
  onDismiss: () => void;
};

function GlassIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-7" aria-hidden="true">
      {/* water fill (lower portion) */}
      {filled && (
        <path
          d="M6.5 11 L17.5 11 L16.5 20.5 L7.5 20.5 Z"
          className="fill-sky-500/80"
        />
      )}
      {/* glass outline */}
      <path
        d="M5 3.6 L19 3.6 L16.5 20.6 L7.5 20.6 Z"
        fill="none"
        strokeWidth="1.6"
        strokeLinejoin="round"
        className={filled ? "stroke-sky-400" : "stroke-slate-600"}
      />
    </svg>
  );
}

export function HydrationTracker({
  glasses,
  goal,
  reminding,
  onDrink,
  onRemove,
  onDismiss,
}: HydrationTrackerProps) {
  const reached = glasses >= goal;

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
          {glasses} / {goal} glasses
        </span>
      </div>

      {reminding && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-slate-950/50 px-3 py-2">
          <span className="text-sm text-sky-300">💧 Time for a sip of water</span>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-slate-400 transition hover:text-slate-200"
          >
            Snooze
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {Array.from({ length: goal }, (_, i) => (
          <span key={i} title={`Glass ${i + 1}`} className="transition">
            <GlassIcon filled={i < glasses} />
          </span>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onDrink}
          className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
        >
          + Add a glass
        </button>
        {glasses > 0 && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove a glass"
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
