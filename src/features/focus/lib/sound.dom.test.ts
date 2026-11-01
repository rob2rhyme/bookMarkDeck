import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AMBIENT_OPTIONS,
  setAmbientVolume,
  startAmbient,
  stopAmbient,
  type AmbientId,
} from "@/features/focus/lib/sound";

// The soundscape engine is Web Audio graph-building, which jsdom doesn't have.
// This is a recording fake: it can't say how anything SOUNDS, but it can show the
// properties that were wrong or would silently break — each soundscape really
// starts a source, channels don't cut each other, a stop releases every source
// and timer, and the volume moves without a restart.
type Node = { kind: string; started: number; stopped: number; connections: Node[]; gain?: ParamStub };
type ParamStub = { value: number; ramps: number[]; targets: number[] } & Record<string, unknown>;

let nodes: Node[];

function param(initial = 0): ParamStub {
  const p: ParamStub = {
    value: initial,
    ramps: [],
    targets: [],
    setValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    exponentialRampToValueAtTime: vi.fn((v: number) => p.ramps.push(v)),
    setTargetAtTime: vi.fn((v: number) => p.targets.push(v)),
  };
  return p;
}

function makeNode(kind: string): Node & Record<string, unknown> {
  const n: Node & Record<string, unknown> = {
    kind,
    started: 0,
    stopped: 0,
    connections: [],
    connect: (to: Node) => {
      n.connections.push(to);
      return to;
    },
    disconnect: vi.fn(),
    start: () => {
      n.started++;
    },
    stop: () => {
      n.stopped++;
    },
    gain: param(1),
    frequency: param(0),
    detune: param(0),
    Q: param(0),
    type: "",
    loop: false,
    buffer: null,
  };
  nodes.push(n);
  return n;
}

class FakeContext {
  state = "running";
  currentTime = 0;
  sampleRate = 8000;
  destination = makeNode("destination");
  resume = vi.fn(async () => {});
  createGain = () => makeNode("gain");
  createOscillator = () => makeNode("osc");
  createBufferSource = () => makeNode("source");
  createBiquadFilter = () => makeNode("filter");
  createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
}

beforeEach(() => {
  nodes = [];
  vi.useFakeTimers();
  vi.stubGlobal("AudioContext", FakeContext);
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
});

afterEach(() => {
  stopAmbient("focus");
  stopAmbient("meditation");
  vi.advanceTimersByTime(5000);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const sources = () => nodes.filter((n) => n.kind === "source" || n.kind === "osc");
const live = () => sources().filter((n) => n.started > n.stopped);

describe("soundscapes", () => {
  const ids = AMBIENT_OPTIONS.map((o) => o.id).filter((id): id is Exclude<AmbientId, "off"> => id !== "off");

  it.each(ids)("%s starts a source and stops every one of them", (id) => {
    startAmbient(id, { channel: "focus" });
    expect(live().length).toBeGreaterThan(0);
    // Rain schedules droplets on a timer; let some fire, then check they clean up.
    vi.advanceTimersByTime(500);

    stopAmbient("focus");
    vi.advanceTimersByTime(1000);
    expect(live()).toHaveLength(0);
    // No droplet timer may outlive the soundscape.
    const before = nodes.length;
    vi.advanceTimersByTime(2000);
    expect(nodes.length).toBe(before);
  });

  it("off starts nothing", () => {
    startAmbient("off", { channel: "focus" });
    expect(nodes.filter((n) => n.kind !== "destination")).toHaveLength(0);
  });

  it("rain adds droplets over time", () => {
    startAmbient("rain", { channel: "focus" });
    const base = sources().length;
    vi.advanceTimersByTime(1000);
    expect(sources().length).toBeGreaterThan(base + 5);
  });
});

describe("channels", () => {
  it("starting a meditation soundscape leaves the focus one running", () => {
    startAmbient("rain", { channel: "focus" });
    const focusSources = live().length;
    startAmbient("drone"); // meditation is the default channel
    expect(live().length).toBeGreaterThan(focusSources);

    stopAmbient("meditation");
    vi.advanceTimersByTime(1000);
    // Only the focus one is left, and it is still sounding.
    expect(live().length).toBeGreaterThan(0);
    expect(live().every((n) => n.started > n.stopped)).toBe(true);
  });

  it("starting again on a channel replaces its soundscape", () => {
    startAmbient("brown", { channel: "focus" });
    startAmbient("wind", { channel: "focus" });
    vi.advanceTimersByTime(1000);
    // Brown's single source is gone; wind's (and its sweep) are running.
    expect(live().length).toBe(2);
  });
});

describe("volume", () => {
  it("starts at the requested level and moves without restarting", () => {
    startAmbient("brown", { channel: "focus", volume: 100 });
    const gains = nodes.filter((n) => n.kind === "gain");
    const out = gains[0] as Node & { gain: ParamStub };
    // brown peaks at 0.16 at volume 50; volume 100 is double that.
    expect(out.gain.ramps.at(-1)).toBeCloseTo(0.32);

    const started = sources().length;
    setAmbientVolume(10, "focus");
    expect(out.gain.targets.at(-1)).toBeCloseTo(0.032);
    expect(sources().length).toBe(started);
  });

  it("clamps absurd volumes", () => {
    startAmbient("brown", { channel: "focus", volume: 5000 });
    const out = nodes.filter((n) => n.kind === "gain")[0] as Node & { gain: ParamStub };
    expect(out.gain.ramps.at(-1)).toBeCloseTo(0.32);
  });

  it("ignores a volume change when nothing is playing", () => {
    expect(() => setAmbientVolume(80, "focus")).not.toThrow();
  });
});
