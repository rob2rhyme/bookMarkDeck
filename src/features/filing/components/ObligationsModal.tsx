"use client";

// Adding what a paper obliges you to do. Presets exist so "renew by" is one tap
// rather than a date-picker chore — the cadences are DEFAULTS, not authority,
// and the UI says so, because renewal periods are jurisdiction-specific.

import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { Trash } from "@/components/icons";
import { Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityTimeline } from "@/features/filing/components/ActivityTimeline";
import { SECTION_LABEL_CLASS, SectionLabel } from "@/components/ui/SectionLabel";
import {
  OBLIGATION_PRESETS,
  bucketOf,
  isOpen,
  periodMonths,
  relativeDue,
  daysBetween,
  type ObligationPreset,
} from "@/features/filing/lib/obligations";
import {
  OBLIGATION_KINDS,
  type FilingDocument,
  type Obligation,
  type ObligationKind,
  type Recurrence,
} from "@/features/filing/lib/types";

const REPEATS: { id: Recurrence; label: string }[] = [
  { id: "none", label: "Doesn't repeat" },
  { id: "monthly", label: "Every month" },
  { id: "quarterly", label: "Every quarter" },
  { id: "yearly", label: "Every year" },
  { id: "custom", label: "Every N months" },
];

const kindIcon = (k: ObligationKind) =>
  OBLIGATION_KINDS.find((o) => o.id === k)?.icon ?? "🔔";

export function ObligationsModal({
  open,
  onClose,
  document,
  today,
  onAdd,
  onComplete,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  document: FilingDocument | null;
  today: string;
  onAdd: (documentId: string, o: Omit<Obligation, "id">) => void;
  onComplete: (documentId: string, obligationId: string) => void;
  onRemove: (documentId: string, obligationId: string) => void;
}) {
  const [presetId, setPresetId] = useState<string>("registration");
  const [dueOn, setDueOn] = useState("");
  const [label, setLabel] = useState("");
  const [repeat, setRepeat] = useState<Recurrence>("yearly");
  const [repeatMonths, setRepeatMonths] = useState("12");
  const [kind, setKind] = useState<ObligationKind>("renew");

  const applyPreset = (p: ObligationPreset) => {
    setPresetId(p.id);
    setKind(p.kind);
    setRepeat(p.repeat);
    if (p.repeatMonths) setRepeatMonths(String(p.repeatMonths));
    setLabel(p.id === "one-off" ? "" : p.label);
  };

  useEffect(() => {
    if (!open) return;
    setDueOn("");
    applyPreset(OBLIGATION_PRESETS.find((p) => p.id === "registration")!);
  }, [open]);

  if (!document) return null;

  const preset = OBLIGATION_PRESETS.find((p) => p.id === presetId);
  const obligations = document.obligations ?? [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dueOn || !document) return;
    onAdd(document.id, {
      kind,
      dueOn,
      label: label.trim() || undefined,
      repeat,
      repeatMonths: repeat === "custom" ? Number(repeatMonths) || undefined : undefined,
      leadDays: preset?.leadDays,
      // Kept so rules that depend on WHICH document this is still apply later —
      // the passport travel-validity window can't be inferred from the date.
      presetId: preset?.id,
    });
    setDueOn("");
    setLabel("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="filing-obligations-title"
      panelClassName="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="filing-obligations-title" className="text-lg font-semibold tracking-tight text-slate-50">
        Reminders
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        For <span className="text-slate-200">{document.title}</span> — what it
        needs, and when.
      </p>

      {obligations.length > 0 && (
        <div className="mt-5">
          <SectionLabel>On this paper</SectionLabel>
          <ul className="mt-2 flex flex-col gap-1">
            {obligations.map((o) => {
              const open_ = isOpen(o);
              const days = daysBetween(today, o.dueOn);
              const every = periodMonths(o);
              return (
                <li
                  key={o.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
                >
                  <span aria-hidden className="shrink-0">
                    {kindIcon(o.kind)}
                  </span>
                  {/* The label is what you're scanning for, so it gets the room:
                      the date moves under it rather than competing for width. */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">
                      {o.label || OBLIGATION_KINDS.find((k) => k.id === o.kind)?.label}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-[11px]">
                      <span
                        className={`tabular-nums ${
                          !open_
                            ? "text-slate-500"
                            : bucketOf(o.dueOn, today) === "overdue"
                              ? "text-red-400"
                              : "text-slate-400"
                        }`}
                      >
                        {o.dueOn}
                        {open_ ? ` · ${relativeDue(days)}` : " · done"}
                      </span>
                      {every && (
                        <span className="text-slate-500">
                          every {every === 12 ? "year" : `${every} mo`}
                        </span>
                      )}
                    </p>
                  </div>
                  {open_ && (
                    <button
                      type="button"
                      onClick={() => onComplete(document.id, o.id)}
                      className="shrink-0 rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
                    >
                      Done
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(document.id, o.id)}
                    aria-label={`Remove ${o.label || o.kind}`}
                    className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-red-500/15 hover:text-red-300"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {obligations.length === 0 && (
        <EmptyState className="mt-5">
          No reminders on this paper yet.
        </EmptyState>
      )}

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <SectionLabel>Add a reminder</SectionLabel>

        <div className="flex flex-wrap gap-1.5">
          {OBLIGATION_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              aria-pressed={presetId === p.id}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                presetId === p.id
                  ? "bg-blue-500/15 text-blue-300"
                  : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <SectionLabel>Due</SectionLabel>
            <Input
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
              aria-label="Due date"
              className="mt-1"
            />
          </div>
          <div>
            <SectionLabel>Repeats</SectionLabel>
            <Select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as Recurrence)}
              aria-label="Repeat"
              className="mt-1"
            >
              {REPEATS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {repeat === "custom" && (
          <div>
            <SectionLabel>Every how many months</SectionLabel>
            <Input
              type="number"
              min={1}
              value={repeatMonths}
              onChange={(e) => setRepeatMonths(e.target.value)}
              aria-label="Repeat months"
              className="mt-1"
            />
          </div>
        )}

        <div>
          <SectionLabel>Call it</SectionLabel>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Registration renewal"
            aria-label="Reminder label"
            className="mt-1"
          />
        </div>

        <p className="text-[12px] text-slate-500">
          Renewal periods differ by state and country — these are sensible
          defaults, not legal or tax advice. Change anything that doesn&rsquo;t
          match yours.
        </p>

        <button
          type="submit"
          disabled={!dueOn}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          Add reminder
        </button>
      </form>

      {(document.activity?.length ?? 0) > 0 && (
        <details className="mt-6">
          <summary className={`cursor-pointer ${SECTION_LABEL_CLASS}`}>
            History
          </summary>
          <ActivityTimeline activity={document.activity} />
        </details>
      )}
    </Modal>
  );
}
