"use client";

type HydrationTrackerProps = {
  glasses: number;
  goal: number;
  reminding: boolean;
  onDrink: () => void;
  onRemove: () => void;
  onDismiss: () => void;
};

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
          <div
            key={i}
            title={`Glass ${i + 1}`}
            className={`h-8 w-6 rounded-b-md rounded-t-sm border transition ${
              i < glasses
                ? "border-sky-400 bg-sky-500/70"
                : "border-slate-600 bg-transparent"
            }`}
          />
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
