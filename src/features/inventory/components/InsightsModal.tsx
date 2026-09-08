"use client";

import { useMemo, useState } from "react";

import { Modal } from "@/components/Modal";
import { X } from "@/components/icons";
import type { InventoryItem } from "@/features/inventory/lib/types";
import {
  categoryShares,
  insightsSummary,
  interestTrend,
  localFacts,
  locationCounts,
  statusMix,
  tagCounts,
  warrantyBuckets,
  type Slice,
} from "@/features/inventory/lib/insights";

// Categorical palette — the reference dark-mode order, validated against the
// slate-900 chart surface (lightness band, chroma, CVD ≥8, normal-vision ≥15,
// ≥3:1 contrast — scripts run at build time of this feature). Assigned in
// fixed order, never cycled; the tail folds into a muted "Other".
const SERIES = ["#3987e5", "#008300", "#d55181", "#c98500", "#199e70"];
const MUTED = "#64748b"; // "Other" / far-future — recessive by design
const SURFACE = "#0f172a"; // slate-900 — the 2px gap color between fills
// Status colors (reserved semantics, paired with labels — never color alone).
const WARRANTY_COLORS: Record<string, string> = {
  expired: "#d03b3b",
  d30: "#ec835a",
  d90: "#fab219",
  year: "#0ca30c",
  later: MUTED,
};

const sliceColor = (label: string, i: number) =>
  label === "Other" || label === "Uncategorized" || label === "Unassigned"
    ? MUTED
    : SERIES[Math.min(i, SERIES.length - 1)];

const clip = (s: string, n = 9) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ── Donut (category share) ─────────────────────────────────────────────── */

function Donut({ slices, total }: { slices: Slice[]; total: number }) {
  const cx = 70;
  const cy = 70;
  const r = 54;
  const sum = slices.reduce((s, x) => s + x.count, 0) || 1;
  // Each slice starts where every slice before it ended, derived rather than
  // accumulated — mutating a running `angle` here is a render-phase write.
  const START = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const sweep = (s.count / sum) * Math.PI * 2;
    const before = slices.slice(0, i).reduce((t, x) => t + x.count, 0);
    const a0 = START + (before / sum) * Math.PI * 2;
    const a1 = a0 + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    return {
      d: `M ${cx},${cy} L ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)} Z`,
      fill: sliceColor(s.label, i),
      title: `${s.label}: ${s.count}`,
    };
  });
  return (
    <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0" role="img" aria-label="Category share">
      {slices.length === 1 ? (
        <circle cx={cx} cy={cy} r={r} fill={arcs[0].fill} />
      ) : (
        arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.fill} stroke={SURFACE} strokeWidth="2">
            <title>{a.title}</title>
          </path>
        ))
      )}
      {/* Donut hole with the hero count */}
      <circle cx={cx} cy={cy} r={32} fill={SURFACE} />
      <text x={cx} y={cy - 1} textAnchor="middle" className="fill-slate-100" fontSize="20" fontWeight="600">
        {total}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-slate-500" fontSize="9">
        items
      </text>
    </svg>
  );
}

/* ── Vertical bars (reusable) ───────────────────────────────────────────── */

function topRounded(x: number, y: number, w: number, h: number, r: number) {
  if (h <= r) return `M ${x},${y + h} v ${-h} h ${w} v ${h} Z`;
  return `M ${x},${y + h} v ${-(h - r)} q 0,${-r} ${r},${-r} h ${w - 2 * r} q ${r},0 ${r},${r} v ${h - r} Z`;
}

function VBars({
  slices,
  colors,
  icons,
}: {
  slices: Slice[];
  colors: (label: string, i: number) => string;
  icons?: string[];
}) {
  const W = 320;
  const baseline = 112;
  const max = Math.max(1, ...slices.map((s) => s.count));
  const slot = W / slices.length;
  const barW = Math.min(38, slot * 0.55);
  return (
    <svg viewBox={`0 0 ${W} 146`} className="w-full" role="img">
      <line x1="0" y1={baseline} x2={W} y2={baseline} stroke="#334155" strokeWidth="1" />
      {slices.map((s, i) => {
        const h = Math.max(s.count > 0 ? 3 : 0, (s.count / max) * 88);
        const x = slot * i + (slot - barW) / 2;
        return (
          <g key={s.label}>
            {h > 0 && (
              <path d={topRounded(x, baseline - h, barW, h, 3)} fill={colors(s.label, i)}>
                <title>{`${s.label}: ${s.count}`}</title>
              </path>
            )}
            <text
              x={x + barW / 2}
              y={baseline - h - 5}
              textAnchor="middle"
              fontSize="10"
              className="fill-slate-400 tabular-nums"
            >
              {s.count}
            </text>
            <text x={x + barW / 2} y={baseline + 14} textAnchor="middle" fontSize="9" className="fill-slate-500">
              {icons?.[i] ? `${icons[i]} ` : ""}
              {clip(s.label)}
              <title>{s.label}</title>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Stacked trend (acquisitions per quarter by category) ───────────────── */

function TrendBars({
  quarters,
  series,
}: {
  quarters: string[];
  series: { label: string; counts: number[] }[];
}) {
  const W = 320;
  const baseline = 112;
  const totals = quarters.map((_, qi) => series.reduce((s, x) => s + x.counts[qi], 0));
  const max = Math.max(1, ...totals);
  const slot = W / quarters.length;
  const barW = Math.min(40, slot * 0.55);
  return (
    <svg viewBox={`0 0 ${W} 140`} className="w-full" role="img" aria-label="Additions per quarter">
      <line x1="0" y1={baseline} x2={W} y2={baseline} stroke="#334155" strokeWidth="1" />
      {quarters.map((q, qi) => {
        const x = slot * qi + (slot - barW) / 2;
        let y = baseline;
        return (
          <g key={q}>
            {series.map((s, si) => {
              const h = (s.counts[qi] / max) * 88;
              if (h <= 0) return null;
              y -= h;
              return (
                <rect
                  key={s.label}
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  fill={sliceColor(s.label, si)}
                  stroke={SURFACE}
                  strokeWidth="1"
                >
                  <title>{`${q} · ${s.label}: ${s.counts[qi]}`}</title>
                </rect>
              );
            })}
            {totals[qi] > 0 && (
              <text
                x={x + barW / 2}
                y={baseline - (totals[qi] / max) * 88 - 5}
                textAnchor="middle"
                fontSize="10"
                className="fill-slate-400 tabular-nums"
              >
                {totals[qi]}
              </text>
            )}
            <text x={x + barW / 2} y={baseline + 14} textAnchor="middle" fontSize="9" className="fill-slate-500">
              {q.replace("-", " ")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Shared bits ────────────────────────────────────────────────────────── */

function Legend({ slices }: { slices: Slice[] }) {
  const sum = slices.reduce((s, x) => s + x.count, 0) || 1;
  return (
    <ul className="min-w-0 flex-1 space-y-1 text-xs">
      {slices.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: sliceColor(s.label, i) }}
          />
          <span className="min-w-0 flex-1 truncate text-slate-300">{s.label}</span>
          <span className="tabular-nums text-slate-400">{s.count}</span>
          <span className="w-9 text-right tabular-nums text-slate-500">
            {Math.round((s.count / sum) * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

function ChartCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="mt-2">{children}</div>
      {caption && <p className="mt-1 text-[11px] text-slate-500">{caption}</p>}
    </section>
  );
}

/* ── The modal ──────────────────────────────────────────────────────────── */

type InsightsModalProps = {
  open: boolean;
  items: InventoryItem[];
  locationNameById: Record<string, string>;
  today: string;
  onClose: () => void;
};

export function InsightsModal({
  open,
  items,
  locationNameById,
  today,
  onClose,
}: InsightsModalProps) {
  const [aiFacts, setAiFacts] = useState<string[] | null>(null);
  const [aiState, setAiState] = useState<"idle" | "busy" | "error">("idle");
  const [aiError, setAiError] = useState<string | null>(null);

  const data = useMemo(() => {
    const cats = categoryShares(items);
    return {
      cats,
      total: items.filter((i) => !i.archived).length,
      locs: locationCounts(items, locationNameById),
      tags: tagCounts(items),
      mix: statusMix(items),
      warranty: warrantyBuckets(items, today),
      trend: interestTrend(items),
      facts: localFacts(items, locationNameById, today),
    };
  }, [items, locationNameById, today]);

  const askAi = async () => {
    setAiState("busy");
    setAiError(null);
    try {
      const res = await fetch("/api/inventory/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: insightsSummary(items, locationNameById, today) }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        facts?: string[];
        error?: string;
      };
      if (json.ok && json.facts?.length) {
        setAiFacts(json.facts);
        setAiState("idle");
      } else {
        setAiError(
          json.error === "ai_unconfigured"
            ? "AI analysis isn't set up on this deployment yet — add ANTHROPIC_API_KEY (see .env.example) and redeploy."
            : json.error === "rate_limited"
              ? "The AI is busy right now — try again in a minute."
              : "Couldn't analyze right now — try again."
        );
        setAiState("error");
      }
    } catch {
      setAiError("Couldn't analyze right now — check your connection and try again.");
      setAiState("error");
    }
  };

  const statusIcons = ["✅", "🤝", "🫥", "🚫", "🔙"];

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="insights-title"
      overlayClassName="inset-0 flex items-stretch justify-center sm:items-center sm:px-4 sm:py-[5vh]"
      panelClassName="flex w-full flex-col max-h-[100dvh] overflow-y-auto overflow-x-hidden bg-slate-900 p-4 shadow-2xl outline-none sm:block sm:max-w-2xl sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-slate-800 sm:p-6"
    >
      <div className="flex items-center justify-between max-sm:sticky max-sm:-top-4 max-sm:z-10 max-sm:-mx-4 max-sm:-mt-4 max-sm:border-b max-sm:border-slate-800/70 max-sm:bg-slate-900/95 max-sm:px-4 max-sm:pb-2.5 max-sm:pt-4 max-sm:backdrop-blur">
        <h2 id="insights-title" className="text-lg font-semibold text-slate-50">
          📈 Insights
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <ChartCard title="What you collect" caption="Share of the catalog by category.">
          <div className="flex items-center gap-4">
            <Donut slices={data.cats} total={data.total} />
            <Legend slices={data.cats} />
          </div>
        </ChartCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <ChartCard title="Where it lives">
            {data.locs.length > 0 ? (
              <VBars slices={data.locs} colors={() => "#3987e5"} />
            ) : (
              <p className="text-xs text-slate-500">No locations yet.</p>
            )}
          </ChartCard>
          <ChartCard title="How you tag">
            {data.tags.length > 0 ? (
              <VBars slices={data.tags} colors={() => "#3987e5"} />
            ) : (
              <p className="text-xs text-slate-500">
                No tags yet — add a few and this fills in.
              </p>
            )}
          </ChartCard>
          <ChartCard title="Keeping vs. gone" caption="Returned items are out of your totals.">
            <VBars slices={data.mix} colors={sliceColor} icons={statusIcons} />
          </ChartCard>
          <ChartCard
            title="Warranty outlook"
            caption={
              data.warranty.uncovered > 0
                ? `${data.warranty.uncovered} item${data.warranty.uncovered === 1 ? " has" : "s have"} no warranty date on record.`
                : undefined
            }
          >
            <VBars
              slices={data.warranty.buckets.map((b) => ({ label: b.label, count: b.count }))}
              colors={(_, i) => WARRANTY_COLORS[data.warranty.buckets[i].key]}
              icons={["⛔", "⏰", "🔜", "🗓", "🌤"]}
            />
          </ChartCard>
        </div>

        {data.trend.quarters.length >= 2 && (
          <ChartCard
            title="Interest over time"
            caption="Additions per quarter, colored by category — watch what's rising."
          >
            <TrendBars quarters={data.trend.quarters} series={data.trend.series} />
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              {data.trend.series.map((s, i) => (
                <li key={s.label} className="flex items-center gap-1.5 text-slate-400">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-sm"
                    style={{ backgroundColor: sliceColor(s.label, i) }}
                  />
                  {s.label}
                </li>
              ))}
            </ul>
          </ChartCard>
        )}

        <ChartCard title="Noticed in your numbers">
          {data.facts.length > 0 ? (
            <ul className="space-y-1.5 text-sm text-slate-300">
              {data.facts.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden>💡</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">Add a few items and facts appear here.</p>
          )}
        </ChartCard>

        <ChartCard
          title="✨ AI read"
          caption="Sends only aggregate counts and category/tag labels — never item names, serials, or notes."
        >
          {aiFacts ? (
            <ul className="space-y-1.5 text-sm text-slate-300">
              {aiFacts.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden>✨</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          ) : aiState === "busy" ? (
            <p className="animate-pulse text-sm text-slate-400">Reading your patterns…</p>
          ) : (
            <>
              {aiState === "error" && aiError && (
                <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {aiError}
                </p>
              )}
              <button
                type="button"
                onClick={askAi}
                className="rounded-full border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-violet-400 hover:text-violet-300"
              >
                ✨ What do my things say about me?
              </button>
            </>
          )}
        </ChartCard>
      </div>
    </Modal>
  );
}
