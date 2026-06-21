// src/components/FishCursor.tsx
"use client";

// A fish cursor overlay. Shares the DragonCursor's exact motion core — the same
// 40-segment follow chain (head eased toward the pointer with a lazy idle orbit;
// each segment chasing the one ahead) — so the follow + smoothness are identical.
// Only the decoration differs: an aquatic body/fins/tail and rising bubbles.

import { useEffect, useRef } from "react";

import type { CursorProps } from "@/lib/cursorSettings";

export function FishCursor({
  size = 1,
  hue = null,
  transition = 0.5,
}: CursorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sizeRef = useRef(size);
  const hueRef = useRef(hue);
  const transRef = useRef(transition);
  useEffect(() => {
    sizeRef.current = size;
    hueRef.current = hue;
    transRef.current = transition;
  }, [size, hue, transition]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Decorative only — skip entirely when the user prefers reduced motion.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const svg = svgRef.current;
    if (!svg) return;

    const screen = svg.querySelector<SVGGElement>("#screen");
    if (!screen) return;

    // Body gradients animated through a shimmering aqua band.
    const bodyGradients = Array.from(
      svg.querySelectorAll<SVGLinearGradientElement>(".fish-body-grad")
    );

    // Fin group — its vertical scale is animated each frame to flap.
    const finsGroup = svg.querySelector<SVGGElement>("#FishFins");

    const xmlns = "http://www.w3.org/2000/svg";
    const xlinkns = "http://www.w3.org/1999/xlink";

    // 🫧 Rising bubble particles
    const BUBBLE_COUNT = 60;
    type Bubble = {
      use: SVGUseElement;
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
    };
    const bubbles: Bubble[] = [];

    const N = 40;
    type ElemData = { use: SVGUseElement | null; x: number; y: number };

    let width = window.innerWidth;
    let height = window.innerHeight;

    const elems: ElemData[] = [];
    for (let i = 0; i < N; i++) {
      elems[i] = { use: null, x: width / 2, y: 0 };
    }

    const pointer = { x: width / 2, y: height / 2 };

    const radmForPointer = () => Math.min(pointer.x, pointer.y) - 20;
    let radm = radmForPointer();
    let frm = Math.random();
    let rad = 0;

    // Fin-flap state: a steady beat whose cadence + depth rise with how hard
    // the fish is turning.
    let prevHeading = 0;
    let flapPhase = 0;
    let turnSmoothed = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      radm = radmForPointer();
    };

    const handlePointerMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      rad = 0;
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, false);

    const prepend = (useId: string, i: number) => {
      const elem = document.createElementNS(xmlns, "use") as SVGUseElement;
      elems[i].use = elem;
      elem.setAttributeNS(xlinkns, "xlink:href", "#" + useId);
      screen.prepend(elem);
    };

    // Build fish parts: head at the front, a forked tail at the very end, a pair
    // of fins partway down, and body segments for the rest.
    for (let i = 1; i < N; i++) {
      if (i === 1) prepend("FishHead", i);
      else if (i === N - 1) prepend("FishTail", i);
      else if (i === 10 || i === 18) prepend("FishFins", i);
      else prepend("FishBody", i);
    }

    let rafId = 0;

    // Bubble <use> elements.
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const use = document.createElementNS(xmlns, "use") as SVGUseElement;
      use.setAttributeNS(xlinkns, "xlink:href", "#Bubble");
      use.setAttribute("opacity", "0");
      screen.append(use);
      bubbles.push({
        use,
        x: width / 2,
        y: height / 2,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
      });
    }

    const run = () => {
      rafId = requestAnimationFrame(run);

      // Shimmering aqua body — cycle hue gently within a teal/cyan band.
      if (bodyGradients.length) {
        const base = hueRef.current ?? 175; // Auto centres on aqua (175)
        bodyGradients.forEach((gradient) => {
          const stops = Array.from(gradient.querySelectorAll("stop"));
          stops.forEach((stop, stopIndex) => {
            const h = base + 30 * Math.sin(frm * 6 + stopIndex * 1.2);
            const color = `hsl(${h}, 72%, ${56 - stopIndex * 6}%)`;
            stop.setAttribute("stop-color", color);
            stop.style.setProperty("stop-color", color);
          });
        });
      }

      // 🫧 Bubbles — emitted near the head, drifting upward as they fade.
      if (bubbles.length && elems[0] && elems[1]) {
        const headPos = elems[1];
        const noseBase = elems[0];
        const dirX = noseBase.x - headPos.x;
        const dirY = noseBase.y - headPos.y;
        const len = Math.hypot(dirX, dirY) || 1;
        const nx = dirX / len;
        const ny = dirY / len;

        // Spawn a bubble now and then from just ahead of the mouth.
        if (frm % 0.02 < 0.01) {
          const spawn = bubbles.find((p) => p.life <= 0);
          if (spawn) {
            const offset = 14 + Math.random() * 6;
            spawn.x = headPos.x + nx * offset + (Math.random() - 0.5) * 6;
            spawn.y = headPos.y + ny * offset;
            spawn.vx = (Math.random() - 0.5) * 0.3;
            spawn.vy = -(0.6 + Math.random() * 0.6); // buoyant rise
            spawn.maxLife = 90 + Math.random() * 40;
            spawn.life = spawn.maxLife;
          }
        }

        for (const p of bubbles) {
          if (p.life <= 0) continue;
          p.life -= 1;
          // Gentle sideways wobble as it rises.
          p.x += p.vx + Math.sin(p.life * 0.15) * 0.25;
          p.y += p.vy;
          p.vy *= 0.992;

          const alpha = Math.max(0, p.life / p.maxLife);
          const scale = 0.4 + (1 - alpha) * 0.9; // grow slightly as they rise
          p.use.setAttribute(
            "transform",
            `translate(${p.x},${p.y}) scale(${scale})`
          );
          p.use.setAttribute("opacity", (alpha * 0.8).toFixed(3));
        }
      }

      // 🐟 Body follow + idle orbit — IDENTICAL to the DragonCursor core.
      const e0 = elems[0];
      const ax = (Math.cos(3 * frm) * rad * width) / height;
      const ay = (Math.sin(4 * frm) * rad * height) / width;

      // Transition: snappier ↔ smoother. 0.5 = the original feel (10 / 4).
      const headDiv = 15 - transRef.current * 10;
      const segDiv = 5.75 - transRef.current * 3.5;
      const sizeMul = sizeRef.current;

      e0.x += (ax + pointer.x - e0.x) / headDiv;
      e0.y += (ay + pointer.y - e0.y) / headDiv;

      for (let i = 1; i < N; i++) {
        const e = elems[i];
        const ep = elems[i - 1];
        const a = Math.atan2(e.y - ep.y, e.x - ep.x);

        e.x += (ep.x - e.x + (Math.cos(a) * (100 - i)) / 5) / segDiv;
        e.y += (ep.y - e.y + (Math.sin(a) * (100 - i)) / 5) / segDiv;

        const s = ((162 + 4 * (1 - i)) / 50) * sizeMul;

        e.use?.setAttributeNS(
          null,
          "transform",
          `translate(${(ep.x + e.x) / 2},${(ep.y + e.y) / 2}) rotate(${
            (180 / Math.PI) * a
          }) translate(0,0) scale(${s},${s})`
        );
      }

      // 🪽 Fins flap — a steady beat that quickens + deepens as the fish turns.
      if (finsGroup && elems[0] && elems[1]) {
        const heading = Math.atan2(
          elems[1].y - elems[0].y,
          elems[1].x - elems[0].x
        );
        let dh = heading - prevHeading;
        if (dh > Math.PI) dh -= 2 * Math.PI;
        else if (dh < -Math.PI) dh += 2 * Math.PI;
        prevHeading = heading;
        // Smoothed magnitude of turning (radians/frame).
        turnSmoothed = turnSmoothed * 0.88 + Math.abs(dh) * 0.12;

        // Base cadence + extra while turning; amplitude (fold depth) likewise.
        flapPhase += 0.22 + Math.min(2.0, turnSmoothed * 14);
        const amp = 0.34 + Math.min(0.42, turnSmoothed * 5);
        const flapY = 1 - amp * Math.abs(Math.sin(flapPhase));
        finsGroup.setAttribute(
          "transform",
          `scale(1.75, ${(1.75 * flapY).toFixed(3)})`
        );
      }

      if (rad < radm) rad++;
      frm += 0.003;
      if (rad > 60) {
        pointer.x += (width / 2 - pointer.x) * 0.05;
        pointer.y += (height / 2 - pointer.y) * 0.05;
      }
    };

    rafId = requestAnimationFrame(run);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
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
        xmlnsXlink="http://www.w3.org/1999/xlink"
        style={{ pointerEvents: "none" }}
      >
        <defs>
          {/* Body + fin gradients (animated through aqua hues in JS). */}
          <linearGradient
            id="FishBodyGrad"
            className="fish-body-grad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="60%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
          <linearGradient id="FishFinGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0891b2" stopOpacity="0.7" />
          </linearGradient>

          {/* Head — front faces -x (eye near the nose), to match the chain's
              rotation convention. */}
          <g id="FishHead">
            <ellipse cx="-2" cy="0" rx="10" ry="7.5" fill="url(#FishBodyGrad)" />
            <circle cx="-7" cy="-2" r="1.7" fill="#0b1722" />
            <circle cx="-7.6" cy="-2.7" r="0.6" fill="#ffffff" />
          </g>

          {/* Body segment — the overlapping chain forms a tapered body. */}
          <g id="FishBody">
            <ellipse cx="0" cy="0" rx="7" ry="5.5" fill="url(#FishBodyGrad)" />
          </g>

          {/* Dorsal + ventral fins, sweeping backward (+x). Large + spiky
              (notched back edge) for a tougher silhouette; scaled up 75%. */}
          <g id="FishFins" fill="url(#FishFinGrad)" transform="scale(1.75)">
            <path d="M-2 -3 L16 -23 L10 -13 L13 -8 L6 -4 Z" />
            <path d="M-2 3 L16 23 L10 13 L13 8 L6 4 Z" />
          </g>

          {/* Forked caudal (tail) fin pointing backward (+x). */}
          <g id="FishTail" fill="url(#FishFinGrad)">
            <path d="M0 0 L15 -11 L9 0 L15 11 Z" />
          </g>

          {/* Bubble prototype. */}
          <g id="Bubble">
            <circle
              cx="0"
              cy="0"
              r="5"
              fill="none"
              stroke="#bae6fd"
              strokeWidth="1.4"
              opacity="0.7"
            />
            <circle cx="-1.6" cy="-1.6" r="1" fill="#e0f7ff" opacity="0.85" />
          </g>
        </defs>
        <g id="screen" />
      </svg>
    </div>
  );
}

export default FishCursor;
