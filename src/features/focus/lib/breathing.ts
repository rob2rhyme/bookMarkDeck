// Pure breathing-pattern definitions + phase math for the Meditation card.
// No React, no audio — fully unit-testable. The card drives an animated pacer
// from breathScale() and reads the current phase from phaseAt().

export type BreathPhaseKind = "in" | "hold" | "out";

export type BreathPhase = {
  label: string;
  seconds: number;
  kind: BreathPhaseKind;
};

export type BreathPattern = {
  id: string;
  name: string;
  description: string;
  phases: BreathPhase[];
};

const IN = (seconds: number): BreathPhase => ({ label: "Breathe in", seconds, kind: "in" });
const OUT = (seconds: number): BreathPhase => ({ label: "Breathe out", seconds, kind: "out" });
const HOLD = (seconds: number): BreathPhase => ({ label: "Hold", seconds, kind: "hold" });

export const BREATH_PATTERNS: readonly BreathPattern[] = [
  {
    id: "box",
    name: "Box",
    description: "Steady focus — in 4, hold 4, out 4, hold 4",
    phases: [IN(4), HOLD(4), OUT(4), HOLD(4)],
  },
  {
    id: "478",
    name: "4-7-8",
    description: "Wind down — in 4, hold 7, out 8",
    phases: [IN(4), HOLD(7), OUT(8)],
  },
  {
    id: "coherence",
    name: "Coherence",
    description: "Balance — in 5, out 5",
    phases: [IN(5), OUT(5)],
  },
  {
    id: "relax",
    name: "Relax",
    description: "Calm — longer exhale, in 4, out 6",
    phases: [IN(4), OUT(6)],
  },
] as const;

export function patternById(id: string): BreathPattern {
  return BREATH_PATTERNS.find((p) => p.id === id) ?? BREATH_PATTERNS[0];
}

export function isBreathPatternId(v: unknown): boolean {
  return typeof v === "string" && BREATH_PATTERNS.some((p) => p.id === v);
}

/** Total seconds in one full cycle of the pattern. */
export function cycleSeconds(p: BreathPattern): number {
  return p.phases.reduce((s, x) => s + x.seconds, 0);
}

export type PhaseAt = {
  phase: BreathPhase;
  index: number;
  phaseElapsed: number; // seconds into the current phase
  phaseRemaining: number; // seconds left in the current phase
};

/** Which phase the pattern is in at `elapsedSec` (loops every cycle). */
export function phaseAt(p: BreathPattern, elapsedSec: number): PhaseAt {
  const cyc = cycleSeconds(p);
  let t = cyc > 0 ? ((elapsedSec % cyc) + cyc) % cyc : 0;
  for (let i = 0; i < p.phases.length; i++) {
    const ph = p.phases[i];
    if (t < ph.seconds) {
      return { phase: ph, index: i, phaseElapsed: t, phaseRemaining: ph.seconds - t };
    }
    t -= ph.seconds;
  }
  const last = p.phases[p.phases.length - 1];
  return { phase: last, index: p.phases.length - 1, phaseElapsed: last.seconds, phaseRemaining: 0 };
}

/** The kind of the most recent non-hold phase before `index` (wraps around). */
function priorMotion(p: BreathPattern, index: number): BreathPhaseKind {
  for (let step = 1; step <= p.phases.length; step++) {
    const k = p.phases[(index - step + p.phases.length) % p.phases.length].kind;
    if (k !== "hold") return k;
  }
  return "in";
}

/**
 * The pacer circle's scale (min..max) at `elapsedSec`. Grows on the inhale,
 * shrinks on the exhale, and holds at whichever end the previous motion left it.
 */
export function breathScale(
  p: BreathPattern,
  elapsedSec: number,
  min = 0.4,
  max = 1
): number {
  const { phase, index, phaseElapsed } = phaseAt(p, elapsedSec);
  const frac = phase.seconds > 0 ? phaseElapsed / phase.seconds : 0;
  if (phase.kind === "in") return min + (max - min) * frac;
  if (phase.kind === "out") return max - (max - min) * frac;
  // hold — stay where the previous motion ended.
  return priorMotion(p, index) === "in" ? max : min;
}
