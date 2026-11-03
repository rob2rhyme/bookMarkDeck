"use client";

import { useState, useSyncExternalStore } from "react";

import {
  DEFAULT_NAME,
  STAGES,
  cleanName,
  companionState,
  readPrefs,
  type CompanionPrefs,
  type Mood,
} from "@/features/habits/lib/companion";

const KEY = "bd:companion:v1";
const CHANGED = "bd:companion-changed";
const keyFor = (account: string | null | undefined) => `${KEY}:${account ?? ""}`;

// Two preferences — the name and whether it's hidden — kept on this device, like
// the other per-device looks (fonts, cursors). Read through useSyncExternalStore so
// the server render (which has no storage) and the first client render agree.
function subscribe(cb: () => void) {
  window.addEventListener(CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
}
function readRaw(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function writePrefs(key: string, prefs: CompanionPrefs) {
  try {
    window.localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    /* storage blocked: the change lasts until reload */
  }
  window.dispatchEvent(new Event(CHANGED));
}

const MOOD_LABEL: Record<Mood, string> = {
  radiant: "radiant",
  glad: "happy",
  waiting: "waiting for you",
  welcome: "glad you're back",
  resting: "resting",
};

/**
 * A small plant that grows with your check-ins and keeps you company today.
 * Everything shown is derived from entries you already have (see lib/companion);
 * only its name and a "hidden" flag are stored, on this device.
 */
export function HabitCompanion({
  account,
  ready,
  checkins,
  dueToday,
  doneToday,
  lastDoneDay,
  today,
}: {
  account: string | null | undefined;
  /** The page's data has loaded, so the counts are real. */
  ready: boolean;
  checkins: number;
  dueToday: number;
  doneToday: number;
  lastDoneDay: string | null;
  today: string;
}) {
  const key = keyFor(account);
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => ""
  );
  const prefs = readPrefs(raw || null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!ready || !today) return null;

  if (prefs.hidden) {
    return (
      <button
        type="button"
        onClick={() => writePrefs(key, { ...prefs, hidden: false })}
        className="self-start rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 transition hover:border-blue-400 hover:text-blue-300"
      >
        Show {prefs.name}
      </button>
    );
  }

  const s = companionState({ checkins, dueToday, doneToday, lastDoneDay, today, name: prefs.name });
  const next = STAGES[s.stage + 1];

  const startEdit = () => {
    setDraft(prefs.name === DEFAULT_NAME ? "" : prefs.name);
    setEditing(true);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    writePrefs(key, { ...prefs, name: cleanName(draft) });
    setEditing(false);
  };

  return (
    <section
      aria-label="Your companion"
      className="flex items-center gap-4 rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:gap-6 sm:p-5"
    >
      <Plant stage={s.stage} mood={s.mood} label={`${prefs.name}, ${s.stageName}, ${MOOD_LABEL[s.mood]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {editing ? (
            <form onSubmit={save} className="flex items-center gap-2">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={40}
                aria-label="Companion name"
                placeholder={DEFAULT_NAME}
                className="w-36 rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 focus:border-blue-400 focus:outline-none"
              />
              <button type="submit" className="text-xs font-medium text-blue-300 hover:underline">
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:underline">
                Cancel
              </button>
            </form>
          ) : (
            <>
              <h2 className="truncate text-base font-semibold text-slate-50">{prefs.name}</h2>
              <span className="text-xs text-slate-400">{s.stageName}</span>
              <button type="button" onClick={startEdit} className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline">
                Rename
              </button>
            </>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-300">{s.line}</p>
        <div className="mt-2 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label={next ? `Growth toward ${next.name}` : "Fully grown"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(s.growth * 100)}
            className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-800"
          >
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(s.growth * 100)}%` }} />
          </div>
          <span className="text-xs text-slate-500">
            {next ? `${s.toNext} more check-in${s.toNext === 1 ? "" : "s"} to ${next.name}` : "Fully grown"}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => writePrefs(key, { ...prefs, hidden: true })}
        className="shrink-0 self-start text-xs text-slate-500 hover:text-slate-300"
      >
        Hide
      </button>
    </section>
  );
}

/* ---------------------------------------------------------------- the plant --- */

const LEAF = "#34d399";
const LEAF_DARK = "#10b981";
const STEM = "#059669";
const POT = "#c2693b";
const POT_RIM = "#a8532d";
const SOIL = "#5b3a29";
const INK = "#0f172a";
const PINK = "#f472b6";

function Leaf({ x, y, a, rx = 9, ry = 4, dark = false }: { x: number; y: number; a: number; rx?: number; ry?: number; dark?: boolean }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={dark ? LEAF_DARK : LEAF} transform={`rotate(${a} ${x} ${y})`} />;
}

function Flower({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={x + 4.5 * Math.cos((a * Math.PI) / 180)} cy={y + 4.5 * Math.sin((a * Math.PI) / 180)} r="3.4" fill={PINK} />
      ))}
      <circle cx={x} cy={y} r="2.6" fill="#fde047" />
    </g>
  );
}

/** Pairs of leaves up a stem: [y, spread]. */
function Pairs({ rows, rx = 9 }: { rows: [number, number][]; rx?: number }) {
  return (
    <>
      {rows.map(([y, spread], i) => (
        <g key={y}>
          <Leaf x={60 - spread} y={y} a={-28} rx={rx} dark={i % 2 === 1} />
          <Leaf x={60 + spread} y={y} a={28} rx={rx} dark={i % 2 === 0} />
        </g>
      ))}
    </>
  );
}

function Growth({ stage }: { stage: number }) {
  const stem = (top: number) => <path d={`M60 80 Q57 ${(80 + top) / 2} 60 ${top}`} stroke={STEM} strokeWidth="3" fill="none" strokeLinecap="round" />;
  switch (stage) {
    case 0:
      return (
        <>
          <ellipse cx="60" cy="79" rx="20" ry="4" fill={SOIL} />
          <ellipse cx="60" cy="76" rx="4" ry="3" fill="#a16207" />
        </>
      );
    case 1:
      return (
        <>
          {stem(66)}
          <Leaf x={53} y={64} a={-30} rx={7} ry={3.5} />
          <Leaf x={67} y={64} a={30} rx={7} ry={3.5} />
        </>
      );
    case 2:
      return (
        <>
          {stem(48)}
          <Pairs rows={[[68, 9], [58, 9], [49, 7]]} />
        </>
      );
    case 3:
      return (
        <>
          {stem(38)}
          <Pairs rows={[[70, 11], [60, 11], [50, 9], [41, 7]]} rx={10} />
        </>
      );
    case 4:
    case 5:
      return (
        <>
          <path d="M60 80 Q40 66 34 48" stroke={STEM} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M60 80 Q80 66 86 48" stroke={STEM} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {stem(30)}
          <Pairs rows={[[72, 12], [62, 12], [52, 10], [42, 9], [33, 7]]} rx={11} />
          <Leaf x={30} y={50} a={-50} rx={9} dark />
          <Leaf x={90} y={50} a={50} rx={9} />
          <Leaf x={36} y={42} a={-20} rx={8} />
          <Leaf x={84} y={42} a={20} rx={8} dark />
          {stage === 5 && (
            <>
              <Flower x={60} y={24} />
              <Flower x={33} y={40} />
              <Flower x={87} y={40} />
            </>
          )}
        </>
      );
    default:
      return (
        <>
          <path d="M56 80 Q54 60 58 44 L64 44 Q66 60 64 80 Z" fill="#8b5a3c" />
          <path d="M60 58 Q48 52 42 44" stroke="#8b5a3c" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M62 52 Q74 48 80 40" stroke="#8b5a3c" strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="60" cy="30" r="22" fill={LEAF_DARK} />
          <circle cx="40" cy="42" r="15" fill={LEAF} />
          <circle cx="80" cy="40" r="16" fill={LEAF} />
          <circle cx="60" cy="38" r="14" fill={LEAF} />
          <Flower x={46} y={30} />
          <Flower x={74} y={26} />
          <Flower x={62} y={44} />
        </>
      );
  }
}

function Face({ mood }: { mood: Mood }) {
  const eyeDots = (
    <>
      <circle cx="51" cy="95" r="2.4" fill={INK} />
      <circle cx="69" cy="95" r="2.4" fill={INK} />
    </>
  );
  const stroke = { stroke: INK, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const };
  switch (mood) {
    case "resting":
      return (
        <>
          <path d="M48 95 q3 3 6 0" {...stroke} />
          <path d="M66 95 q3 3 6 0" {...stroke} />
          <path d="M56 103 q4 2 8 0" {...stroke} />
        </>
      );
    case "waiting":
      return (
        <>
          {eyeDots}
          <path d="M55 102 q5 3 10 0" {...stroke} />
        </>
      );
    case "radiant":
      return (
        <>
          <path d="M48 96 q3 -4 6 0" {...stroke} />
          <path d="M66 96 q3 -4 6 0" {...stroke} />
          <path d="M52 100 q8 9 16 0 z" fill={INK} stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="45" cy="101" r="3" fill="#f9a8d4" opacity="0.7" />
          <circle cx="75" cy="101" r="3" fill="#f9a8d4" opacity="0.7" />
        </>
      );
    default: // glad, welcome
      return (
        <>
          {eyeDots}
          <path d="M53 101 q7 6 14 0" {...stroke} />
        </>
      );
  }
}

function Plant({ stage, mood, label }: { stage: number; mood: Mood; label: string }) {
  return (
    <svg viewBox="0 0 120 120" width="96" height="96" role="img" aria-label={label} className="shrink-0">
      <Growth stage={stage} />
      <path d="M38 84 L82 84 L77 112 Q60 116 43 112 Z" fill={POT} />
      <rect x="32" y="77" width="56" height="9" rx="3" fill={POT_RIM} />
      <Face mood={mood} />
      {mood === "welcome" && (
        <path transform="translate(10 -18)" d="M94 40 c-6 -5 -9 -9 -5 -12 c3 -2 5 1 5 3 c0 -2 2 -5 5 -3 c4 3 1 7 -5 12z" fill={PINK} />
      )}
      {mood === "radiant" && (
        <g fill="#fde047">
          <path d="M20 30 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" />
          <path d="M100 22 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z" />
        </g>
      )}
    </svg>
  );
}

export default HabitCompanion;
