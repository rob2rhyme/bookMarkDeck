// A colour per tag, so the same tag reads the same everywhere — the card's
// ribbon, its chips and the filter row — and a list can be scanned by colour.
//
// Derived from the tag's own text, never stored: it can't drift, and it needs no
// sync. It is stable across devices because it depends only on the canonical
// tag. A fixed palette of Tailwind classes (spelled out in full so the compiler
// sees them) over steps the theme map already declares — see
// src/lib/themeTokens.test.ts — so both themes work. Colour is never the only
// signal: the ribbon always carries the tag's name.

export type TagTone = {
  /** Resting ribbon / chip: tinted ground, readable text, matching edge. */
  soft: string;
  /** Picked tag: a solid-enough ground that reads as "on" at a glance. */
  on: string;
};

const TONES: TagTone[] = [
  { soft: "border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25", on: "border-sky-300 bg-sky-500/45 text-sky-200" },
  { soft: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25", on: "border-emerald-300 bg-emerald-500/45 text-emerald-200" },
  { soft: "border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25", on: "border-amber-300 bg-amber-500/45 text-amber-200" },
  { soft: "border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25", on: "border-rose-300 bg-rose-500/45 text-rose-200" },
  { soft: "border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25", on: "border-violet-300 bg-violet-500/45 text-violet-200" },
  { soft: "border-teal-500/40 bg-teal-500/15 text-teal-200 hover:bg-teal-500/25", on: "border-teal-300 bg-teal-500/45 text-teal-200" },
  { soft: "border-indigo-500/40 bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25", on: "border-indigo-300 bg-indigo-500/45 text-indigo-200" },
  { soft: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25", on: "border-cyan-300 bg-cyan-500/45 text-cyan-200" },
];

/** FNV-1a over the tag's UTF-16 units: small, dependency-free, and well spread over short strings. */
function hash(tag: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const TAG_TONE_COUNT = TONES.length;

/** The tone for a canonical tag. The same tag always gets the same one. */
export function tagTone(tag: string): TagTone {
  return TONES[hash(tag) % TONES.length];
}
