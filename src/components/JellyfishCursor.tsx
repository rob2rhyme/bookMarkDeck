// src/components/JellyfishCursor.tsx
"use client";

// A procedural jellyfish cursor overlay (styled after the supplied art). It
// eases after the pointer with the shared follow feel + lazy idle re-centre,
// and swims realistically: a translucent bell that pulses (contract → relax),
// many tentacles + frilly oral arms that undulate and trail, a thrust-synced
// up/down bob, and a water wake (ripple rings on each pulse + rising bubbles).
// The bell pulse + tentacle motion live INSIDE the rig, so trailing babies
// (live <use> mirrors) breathe and undulate too. Shares the overlay settings
// (size, colour/hue, jelly translucency, transition, babies). Skipped under
// prefers-reduced-motion.

import { useEffect, useRef } from "react";

import { setupBabies } from "@/components/cursorBabies";
import type { CursorProps } from "@/lib/cursorSettings";

const R = 19; // bell radius (local units)
const TENTS = 11; // trailing tentacles
const ARMS = 4; // central oral arms
const TSEG = 10; // segments per tentacle

export function JellyfishCursor({
  size = 1,
  hue = null,
  transition = 0.5,
  jelly = false,
  babies = false,
  babyCount = 2,
  babyGap = 16,
  babySpread = 30,
  babySize = 0.5,
}: CursorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sizeRef = useRef(size);
  const hueRef = useRef(hue);
  const transRef = useRef(transition);
  const jellyRef = useRef(jelly);
  const babiesRef = useRef(babies);
  const babyCountRef = useRef(babyCount);
  const babyGapRef = useRef(babyGap);
  const babySpreadRef = useRef(babySpread);
  const babySizeRef = useRef(babySize);
  useEffect(() => {
    sizeRef.current = size;
    hueRef.current = hue;
    transRef.current = transition;
    jellyRef.current = jelly;
    babiesRef.current = babies;
    babyCountRef.current = babyCount;
    babyGapRef.current = babyGap;
    babySpreadRef.current = babySpread;
    babySizeRef.current = babySize;
  }, [
    size,
    hue,
    transition,
    jelly,
    babies,
    babyCount,
    babyGap,
    babySpread,
    babySize,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const svg = svgRef.current;
    if (!svg) return;
    const q = <T extends Element>(s: string) => svg.querySelector<T>(s);

    const root = q<SVGGElement>("#jelly");
    const bell = q<SVGGElement>("#jelly-bell");
    const bellGrad = q<SVGRadialGradientElement>("#jelly-bell-grad");
    const tentGroup = q<SVGGElement>("#jelly-tentacles");
    const armGroup = q<SVGGElement>("#jelly-arms");
    const tents = Array.from(svg.querySelectorAll<SVGPathElement>(".jelly-tent"));
    const arms = Array.from(svg.querySelectorAll<SVGPathElement>(".jelly-arm"));
    if (!root || !bell) return;

    // Babies — trailing baby jellyfish, kept upright (they hang, not bank).
    const babyGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    ) as SVGGElement;
    q("#jelly-babies")?.appendChild(babyGroup);
    const babyRig = setupBabies(
      babyGroup,
      "jelly-rig",
      {
        on: babiesRef,
        count: babyCountRef,
        gap: babyGapRef,
        spread: babySpreadRef,
        size: babySizeRef,
      },
      { upright: true }
    );

    // Water FX (world-space, behind the jellyfish): ripple rings + bubbles.
    const svgns = "http://www.w3.org/2000/svg";
    const fx = q<SVGGElement>("#jelly-fx");
    type Ripple = { el: SVGCircleElement; x: number; y: number; r0: number; life: number; max: number; scale: number };
    type Bub = { el: SVGCircleElement; x: number; y: number; vy: number; life: number; max: number };
    const ripplePool: Ripple[] = [];
    const bubblePool: Bub[] = [];
    if (fx) {
      for (let i = 0; i < 10; i++) {
        const c = document.createElementNS(svgns, "circle");
        c.setAttribute("fill", "none");
        c.setAttribute("stroke", "#bae6fd");
        c.setAttribute("stroke-width", "1.4");
        c.setAttribute("opacity", "0");
        fx.appendChild(c);
        ripplePool.push({ el: c, x: 0, y: 0, r0: 0, life: 0, max: 1, scale: 1 });
      }
      for (let i = 0; i < 40; i++) {
        const c = document.createElementNS(svgns, "circle");
        c.setAttribute("fill", "none");
        c.setAttribute("stroke", "#bae6fd");
        c.setAttribute("stroke-width", "1.1");
        c.setAttribute("opacity", "0");
        fx.appendChild(c);
        bubblePool.push({ el: c, x: 0, y: 0, vy: 0, life: 0, max: 1 });
      }
    }

    const setStops = (g: SVGGradientElement | null, c0: string, c1: string) => {
      const st = g?.querySelectorAll<SVGStopElement>("stop");
      if (!st) return;
      if (st[0]) { st[0].setAttribute("stop-color", c0); st[0].style.setProperty("stop-color", c0); }
      if (st[1]) { st[1].setAttribute("stop-color", c1); st[1].style.setProperty("stop-color", c1); }
    };

    let w = window.innerWidth;
    let h = window.innerHeight;
    const pointer = { x: w / 2, y: h / 2 };
    let bodyX = pointer.x;
    let bodyY = pointer.y;
    let frm = Math.random();
    let pulse = 0;
    let lastRing = 0;
    let bubbleTimer = 0;
    let rad = 0;
    let radm = Math.min(pointer.x, pointer.y) - 20;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      radm = Math.min(pointer.x, pointer.y) - 20;
    };
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      rad = 0;
    };
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, false);

    let rafId = 0;
    const run = () => {
      rafId = requestAnimationFrame(run);

      // Eased follow (snappy ↔ smooth) + a wide idle orbit.
      const headDiv = 15 - transRef.current * 10;
      const ax = (Math.cos(3 * frm) * rad * w) / h;
      const ay = (Math.sin(4 * frm) * rad * h) / w;
      const pbx = bodyX;
      bodyX += (ax + pointer.x - bodyX) / headDiv;
      bodyY += (ay + pointer.y - bodyY) / headDiv;
      const velX = bodyX - pbx;

      const sizeMul = sizeRef.current;
      const s = 2.2 * sizeMul; // bell ≈ 84px wide at 100%

      // Bell pulse: quick contraction (sin>0 ⇒ narrower + taller) easing back.
      pulse += 0.085;
      const sp = Math.sin(pulse);
      // Thrust-synced swim: rises on the contraction, settles on the relax.
      const bobY = -sp * 7 * sizeMul;
      const bobX = Math.cos(frm * 5) * 2.5 * sizeMul;
      const lean = Math.max(-10, Math.min(10, velX * 1.3));

      // Pulse the bell (inside the rig → babies mirror it).
      const bx = 1 - 0.11 * sp;
      const by = 1 + 0.13 * sp;
      bell.setAttribute("transform", `scale(${bx.toFixed(3)},${by.toFixed(3)})`);

      // Undulate the tentacles + oral arms (trailing, whipping on the pulse).
      const swing = 0.7 + 0.55 * sp; // amplitude swells as the bell contracts
      for (let i = 0; i < tents.length; i++) {
        const baseX = -R * 0.85 + (i * (1.7 * R)) / (tents.length - 1);
        let d = `M ${baseX.toFixed(1)} 0`;
        for (let k = 1; k <= TSEG; k++) {
          const t = k / TSEG;
          const yy = t * (54 * 1);
          const amp = (1.4 + yy * 0.12) * swing;
          const xx =
            baseX * (1 - 0.22 * t) +
            Math.sin(yy * 0.16 + pulse * 1.15 + i * 0.7) * amp;
          d += ` L ${xx.toFixed(1)} ${yy.toFixed(1)}`;
        }
        tents[i].setAttribute("d", d);
      }
      for (let i = 0; i < arms.length; i++) {
        const baseX = -6 + (i * 12) / (arms.length - 1);
        let d = `M ${baseX.toFixed(1)} -1`;
        for (let k = 1; k <= 7; k++) {
          const t = k / 7;
          const yy = t * 30;
          const amp = (2.2 + yy * 0.18) * swing;
          const xx = baseX * (1 - 0.3 * t) + Math.sin(yy * 0.22 + pulse * 1.3 + i) * amp;
          d += ` L ${xx.toFixed(1)} ${yy.toFixed(1)}`;
        }
        arms[i].setAttribute("d", d);
      }

      // Position the whole creature (no pulse here — that lives in the rig).
      root.setAttribute(
        "transform",
        `translate(${(bodyX + bobX).toFixed(1)},${(bodyY + bobY).toFixed(
          1
        )}) rotate(${lean.toFixed(2)}) scale(${s.toFixed(3)})`
      );

      // Colour: Auto = a soft violet/aqua jelly; Custom shifts the hue; Jelly =
      // extra-translucent + paler. Recolours the bell + tentacle/arm strokes.
      const jel = jellyRef.current;
      const baseHue = hueRef.current;
      const hh = baseHue ?? 285; // violet-pink by default
      if (jel) {
        setStops(bellGrad, `hsl(${hh}, 60%, 92%)`, `hsl(${hh}, 60%, 74%)`);
        tentGroup?.setAttribute("stroke", `hsl(${hh}, 55%, 80%)`);
        armGroup?.setAttribute("stroke", `hsl(${hh}, 55%, 82%)`);
        root.setAttribute("opacity", "0.4");
      } else {
        setStops(bellGrad, `hsl(${hh}, 85%, 88%)`, `hsl(${hh}, 70%, 60%)`);
        tentGroup?.setAttribute("stroke", `hsl(${hh}, 75%, 68%)`);
        armGroup?.setAttribute("stroke", `hsl(${hh}, 78%, 72%)`);
        root.setAttribute("opacity", "0.78");
      }

      // Babies trail the body (they mirror the live rig: pulse + undulation).
      babyRig.update(bodyX + bobX, bodyY + bobY, s);
      babyGroup.style.opacity = jel ? "0.4" : "0.78";

      // 〜 Ripple rings — one per bell contraction, plus faster while moving.
      const ringId = Math.floor(pulse / Math.PI);
      if (ringId !== lastRing) {
        lastRing = ringId;
        const rp = ripplePool.find((p) => p.life <= 0);
        if (rp) {
          rp.x = bodyX + bobX;
          rp.y = bodyY + bobY;
          rp.scale = s;
          rp.r0 = R * s * 0.7;
          rp.max = 46 + Math.random() * 18;
          rp.life = rp.max;
        }
      }
      for (const rp of ripplePool) {
        if (rp.life <= 0) continue;
        rp.life -= 1;
        const t = 1 - rp.life / rp.max;
        rp.el.setAttribute("cx", rp.x.toFixed(1));
        rp.el.setAttribute("cy", rp.y.toFixed(1));
        rp.el.setAttribute("r", (rp.r0 + t * 16 * rp.scale).toFixed(1));
        rp.el.setAttribute("opacity", ((1 - t) * 0.45).toFixed(3));
      }

      // 🫧 Bubbles — rise from the bell top, drifting as they fade.
      bubbleTimer -= 1;
      if (bubbleTimer <= 0) {
        const b = bubblePool.find((p) => p.life <= 0);
        if (b) {
          b.x = bodyX + bobX + (Math.random() - 0.5) * R * s * 0.8;
          b.y = bodyY + bobY - R * s * 0.9;
          b.vy = -(0.5 + Math.random() * 0.7);
          b.max = 80 + Math.random() * 40;
          b.life = b.max;
          b.el.setAttribute("r", (1.3 + Math.random() * 1.5).toFixed(2));
        }
        bubbleTimer = 10 + Math.random() * 16;
      }
      for (const b of bubblePool) {
        if (b.life <= 0) continue;
        b.life -= 1;
        b.x += Math.sin(b.life * 0.15) * 0.25;
        b.y += b.vy;
        const alpha = Math.max(0, b.life / b.max);
        b.el.setAttribute("cx", b.x.toFixed(1));
        b.el.setAttribute("cy", b.y.toFixed(1));
        b.el.setAttribute("opacity", (alpha * 0.55).toFixed(3));
      }

      if (rad < radm) rad++;
      frm += 0.003;
      if (rad > 60) {
        pointer.x += (w / 2 - pointer.x) * 0.05;
        pointer.y += (h / 2 - pointer.y) * 0.05;
      }
    };
    rafId = requestAnimationFrame(run);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 select-none"
      aria-hidden="true"
    >
      <svg
        ref={svgRef}
        className="pointer-events-none h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        style={{ pointerEvents: "none" }}
      >
        <defs>
          <radialGradient id="jelly-bell-grad" cx="50%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#f5d9ff" />
            <stop offset="100%" stopColor="#b06fd6" />
          </radialGradient>

          {/* The jellyfish body — bell on top, tentacles + oral arms below.
              JS animates the bell pulse + the strand paths each frame. */}
          <g id="jelly-rig">
            <g
              id="jelly-tentacles"
              fill="none"
              stroke="#b06fd6"
              strokeWidth="1.3"
              strokeLinecap="round"
              opacity="0.85"
            >
              {Array.from({ length: TENTS }).map((_, i) => (
                <path key={i} className="jelly-tent" d="M0 0 L0 50" />
              ))}
            </g>
            <g
              id="jelly-arms"
              fill="none"
              stroke="#c98fe0"
              strokeWidth="2.6"
              strokeLinecap="round"
              opacity="0.8"
            >
              {Array.from({ length: ARMS }).map((_, i) => (
                <path key={i} className="jelly-arm" d="M0 0 L0 30" />
              ))}
            </g>
            <g id="jelly-bell">
              <path
                d={`M ${-R} 1 C ${-R} ${-1.45 * R}, ${R} ${-1.45 * R}, ${R} 1 C ${
                  R * 0.6
                } 5, ${-R * 0.6} 5, ${-R} 1 Z`}
                fill="url(#jelly-bell-grad)"
              />
              {/* soft inner highlight */}
              <ellipse cx={-R * 0.18} cy={-R * 0.7} rx={R * 0.34} ry={R * 0.5} fill="#ffffff" opacity="0.35" />
            </g>
          </g>
        </defs>

        {/* Water FX behind everything, then babies, then the parent. */}
        <g id="jelly-fx" />
        <g id="jelly-babies" />
        <g id="jelly" opacity="0">
          <use href="#jelly-rig" />
        </g>
      </svg>
    </div>
  );
}

export default JellyfishCursor;
