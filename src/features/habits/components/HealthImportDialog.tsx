"use client";

import { useMemo, useRef, useState } from "react";

import { DateInput } from "@/components/DateTimeField";
import { Modal } from "@/components/Modal";
import { addDays } from "@/features/habits/lib/day";
import { HealthImportError, readHealthFiles } from "@/features/habits/lib/healthFile";
import {
  METRICS,
  planHealthEntries,
  suggestLink,
  summarize,
  type DailyHealth,
  type HealthLink,
  type HealthMetric,
} from "@/features/habits/lib/healthImport";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Habits a metric can be linked to (not "quit" habits: less-is-better has no health bar). */
  habits: Habit[];
  existingEntryIds: Set<string>;
  today: string;
  /** Create these entries, and save the habits whose link changed. */
  onApply: (entries: HabitEntry[], changed: Habit[]) => void;
  onUndo: (entryIds: string[]) => void;
};

type Draft = { metric: HealthMetric | ""; threshold: string };

export function HealthImportDialog(props: Props) {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      label="Import health data"
      panelClassName="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      {/* Mounted only while open, so every visit starts clean. */}
      {props.open && <Body {...props} />}
    </Modal>
  );
}

function Body({ onClose, habits, existingEntryIds, today, onApply, onUndo }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "reading" | "ready" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [daily, setDaily] = useState<DailyHealth | null>(null);
  const [from, setFrom] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [applied, setApplied] = useState<{ ids: string[]; days: number; habits: number } | null>(null);

  const summary = useMemo(() => (daily ? summarize(daily) : null), [daily]);

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setStatus("reading");
    setProgress(0);
    setError("");
    setApplied(null);
    setFileNames(files.map((f) => f.name));
    try {
      const result = await readHealthFiles(files, setProgress);
      const s = summarize(result);
      if (s.first === null) throw new HealthImportError("That file didn’t contain any days of steps, exercise, sleep or mindful time.");
      setDaily(result);
      // Default to the last 90 days: a decade of history is rarely what you want marked.
      const ninety = addDays(today, -90);
      setFrom(s.first > ninety ? s.first : ninety);
      // Start from each habit's saved link, else a guess from its name.
      const next: Record<string, Draft> = {};
      for (const h of habits) {
        const link = h.healthLink ?? suggestLink(h);
        next[h.id] = link
          ? { metric: link.metric, threshold: String(link.threshold) }
          : { metric: "", threshold: "" };
      }
      setDrafts(next);
      setStatus("ready");
    } catch (e) {
      setDaily(null);
      setError(
        e instanceof HealthImportError
          ? e.message
          : "Couldn’t read that file. For an Apple Health export, pick the export.zip itself."
      );
      setStatus("error");
    }
  };

  const linkOf = (h: Habit): HealthLink | undefined => {
    const d = drafts[h.id];
    if (!d || !d.metric) return undefined;
    const threshold = h.type === "measurable" ? 0 : Math.max(0, Number(d.threshold) || 0);
    return { metric: d.metric, threshold };
  };

  const linked = useMemo(
    () => habits.map((h) => ({ ...h, healthLink: linkOf(h) })),
    // linkOf reads drafts; habits is stable per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits, drafts]
  );

  const plan = useMemo(
    () =>
      daily && from
        ? planHealthEntries(linked, daily, existingEntryIds, { from, to: today }, new Date().toISOString())
        : null,
    [daily, from, linked, existingEntryIds, today]
  );

  const nameOf = (id: string) => habits.find((h) => h.id === id)?.name ?? "";
  const toAdd = plan?.entries.length ?? 0;
  const alreadyLogged = plan?.perHabit.reduce((n, p) => n + p.alreadyLogged, 0) ?? 0;

  const apply = () => {
    if (!plan || toAdd === 0) return;
    // Save only habits whose link actually changed (or was cleared).
    const changed = habits
      .map((h, i) => ({ h, next: linked[i].healthLink }))
      .filter(({ h, next }) => JSON.stringify(h.healthLink ?? null) !== JSON.stringify(next ?? null))
      .map(({ h, next }) => ({ ...h, healthLink: next }));
    onApply(plan.entries, changed);
    setApplied({
      ids: plan.entries.map((e) => e.id),
      days: plan.entries.length,
      habits: plan.perHabit.filter((p) => p.add > 0).length,
    });
  };

  const field =
    "rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-400 focus:outline-none";

  return (
    <>
      <h2 className="text-lg font-semibold tracking-tight text-slate-50">Import health data</h2>
      <p className="mt-1 text-sm text-slate-400">
        Mark habits done from the days your steps, exercise, sleep or mindful minutes reached a bar you
        choose. The file is read in this browser and never uploaded, and the numbers are not kept — only the
        done-marks they produce.
      </p>

      {status !== "ready" && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={status === "reading"}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {status === "reading" ? `Reading… ${Math.round(progress * 100)}%` : "Choose a file"}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".zip,.xml,.csv,application/zip,text/xml,text/csv"
            aria-label="Health data file"
            className="hidden"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              void onFiles(files);
            }}
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          )}
          <details className="mt-4 text-xs text-slate-400">
            <summary className="cursor-pointer text-slate-300">Where do I get this file?</summary>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                <strong>iPhone:</strong> Health app → your picture → <em>Export All Health Data</em>. Pick the{" "}
                <code>export.zip</code> as it is — no need to unzip it. Big exports can take a minute.
              </li>
              <li>
                <strong>Google Fit:</strong> Google Takeout → Fit → download. Pick the ZIP, or the CSVs inside it.
              </li>
              <li>
                <strong>Anything else:</strong> a CSV with a <code>date</code> column and any of{" "}
                <code>steps</code>, <code>exercise minutes</code>, <code>sleep hours</code>,{" "}
                <code>mindful minutes</code>.
              </li>
            </ul>
          </details>
        </div>
      )}

      {status === "ready" && summary && daily && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-slate-300">
            <span className="text-slate-100">{fileNames.join(", ")}</span> covers {summary.first} to{" "}
            {summary.last}:{" "}
            {METRICS.filter((m) => summary.days[m.id] > 0)
              .map((m) => `${summary.days[m.id]} days of ${m.label.toLowerCase()}`)
              .join(", ")}
            .
          </p>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            Mark days from
            <DateInput value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Mark days from" className={field} />
          </label>

          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
            {habits.map((h) => {
              const d = drafts[h.id] ?? { metric: "", threshold: "" };
              const fits = METRICS.filter((m) => m.fits.includes(h.type));
              const meta = d.metric ? METRICS.find((m) => m.id === d.metric) : null;
              return (
                <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                    {h.emoji} {h.name}
                  </span>
                  <select
                    value={d.metric}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [h.id]: {
                          metric: e.target.value as HealthMetric | "",
                          threshold:
                            prev[h.id]?.threshold ||
                            String(suggestLink(h)?.metric === e.target.value ? suggestLink(h)!.threshold : ""),
                        },
                      }))
                    }
                    aria-label={`${h.name}: health data`}
                    className={field}
                  >
                    <option value="">Not linked</option>
                    {fits.map((m) => (
                      <option key={m.id} value={m.id} disabled={summary.days[m.id] === 0}>
                        {m.label}
                        {summary.days[m.id] === 0 ? " (none in file)" : ""}
                      </option>
                    ))}
                  </select>
                  {meta && h.type === "binary" && (
                    <label className="flex items-center gap-1 text-xs text-slate-400">
                      at least
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={d.threshold}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [h.id]: { ...d, threshold: e.target.value } }))
                        }
                        aria-label={`${h.name}: threshold`}
                        className={`${field} w-20`}
                      />
                      {meta.unit}
                    </label>
                  )}
                  {meta && h.type === "measurable" && (
                    <span className="text-xs text-slate-500">each day’s {meta.unit} becomes its count</span>
                  )}
                </li>
              );
            })}
            {habits.length === 0 && (
              <li className="text-sm text-slate-500">Add a habit first — there’s nothing to link yet.</li>
            )}
          </ul>

          {plan && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300">
              {toAdd === 0 ? (
                <span>
                  Nothing to mark yet — link a habit above, or lower its bar.
                  {alreadyLogged > 0 && ` (${alreadyLogged} qualifying days are already logged.)`}
                </span>
              ) : (
                <>
                  <p>
                    Will mark <strong className="text-slate-50">{toAdd}</strong> day{toAdd === 1 ? "" : "s"} done:
                  </p>
                  <ul className="mt-1 text-xs text-slate-400">
                    {plan.perHabit
                      .filter((p) => p.add > 0)
                      .map((p) => (
                        <li key={p.habitId}>
                          {nameOf(p.habitId)} — {p.add}
                        </li>
                      ))}
                  </ul>
                  {alreadyLogged > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      {alreadyLogged} qualifying day{alreadyLogged === 1 ? " is" : "s are"} already logged and left
                      exactly as they are.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {applied && (
            <p role="status" className="text-sm text-emerald-300">
              Marked {applied.days} day{applied.days === 1 ? "" : "s"} across {applied.habits} habit
              {applied.habits === 1 ? "" : "s"}.{" "}
              <button
                type="button"
                onClick={() => {
                  onUndo(applied.ids);
                  setApplied(null);
                }}
                className="underline transition hover:text-emerald-200"
              >
                Undo
              </button>
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        {status === "ready" && (
          <button
            type="button"
            onClick={() => {
              setStatus("idle");
              setDaily(null);
              setApplied(null);
            }}
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
          >
            Choose another file
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
        >
          {applied ? "Done" : "Close"}
        </button>
        {status === "ready" && (
          <button
            type="button"
            onClick={apply}
            disabled={toAdd === 0 || applied !== null}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Mark {toAdd} day{toAdd === 1 ? "" : "s"} done
          </button>
        )}
      </div>
    </>
  );
}
