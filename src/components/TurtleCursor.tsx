// src/components/TurtleCursor.tsx
"use client";

// A sea-turtle cursor overlay. Like the fish it follows the pointer with eased
// inertia + a lazy idle orbit, but the turtle is compact: a short lead→shell
// chain (so the shell banks into turns) plus fully procedural appendages — front
// flippers that "fly" (synchronised up/down strokes that quicken with speed &
// turning), rear flippers that steer, a bobbing head + blinking eye, and a
// swaying tail. A "jelly" colour mode renders it translucent like a jellyfish.
// All motion is procedural and reads live settings via refs (no restart on
// change); the whole thing is skipped under prefers-reduced-motion.

import { useEffect, useRef } from "react";

import type { CursorProps } from "@/lib/cursorSettings";

export function TurtleCursor({
  size = 1,
  hue = null,
  finHue = null,
  antennaHue = null,
  finSize = 1,
  blinkSpeed = 1,
  transition = 0.5,
  jelly = false,
}: CursorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sizeRef = useRef(size);
  const hueRef = useRef(hue);
  const finHueRef = useRef(finHue);
  const antHueRef = useRef(antennaHue);
  const finSizeRef = useRef(finSize);
  const blinkSpeedRef = useRef(blinkSpeed);
  const transRef = useRef(transition);
  const jellyRef = useRef(jelly);
  useEffect(() => {
    sizeRef.current = size;
    hueRef.current = hue;
    finHueRef.current = finHue;
    antHueRef.current = antennaHue;
    finSizeRef.current = finSize;
    blinkSpeedRef.current = blinkSpeed;
    transRef.current = transition;
    jellyRef.current = jelly;
  }, [size, hue, finHue, antennaHue, finSize, blinkSpeed, transition, jelly]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const svg = svgRef.current;
    if (!svg) return;
    const q = <T extends Element>(id: string) => svg.querySelector<T>(id);

    const root = q<SVGGElement>("#turtle");
    const frontL = q<SVGGElement>("#t-front-flipper-l");
    const frontR = q<SVGGElement>("#t-front-flipper-r");
    const rearL = q<SVGGElement>("#t-rear-flipper-l");
    const rearR = q<SVGGElement>("#t-rear-flipper-r");
    const tail = q<SVGGElement>("#t-tail");
    const head = q<SVGGElement>("#t-head");
    const eye2 = q<SVGGElement>("#t-eye2");
    const shellGrad = q<SVGRadialGradientElement>("#t-shell-grad");
    const finGrad = q<SVGLinearGradientElement>("#t-fin-grad");
    const scutes = q<SVGGElement>("#t-scutes");
    if (!root) return;

    const setStops = (
      g: SVGGradientElement | null,
      c0: string,
      c1: string
    ) => {
      const st = g?.querySelectorAll<SVGStopElement>("stop");
      if (!st) return;
      if (st[0]) {
        st[0].setAttribute("stop-color", c0);
        st[0].style.setProperty("stop-color", c0);
      }
      if (st[1]) {
        st[1].setAttribute("stop-color", c1);
        st[1].style.setProperty("stop-color", c1);
      }
    };

    let w = window.innerWidth;
    let h = window.innerHeight;

    const pointer = { x: w / 2, y: h / 2 };
    const radmFor = () => Math.min(pointer.x, pointer.y) - 20;
    let radm = radmFor();
    let frm = Math.random();
    let rad = 0;

    let leadX = w / 2;
    let leadY = h / 2;
    let leadPX = leadX;
    let leadPY = leadY;
    let bodyX = w / 2;
    let bodyY = h / 2;
    let prevHeading = 0;
    let turnSigned = 0;
    let speed = 0;
    let flipPhase = Math.random() * 6;
    let wob = Math.random() * 6;

    // Eye blink (frequent, occasionally slow) — same model as the fish.
    let blinkWait = 60 + Math.random() * 120;
    let blinkProg = 0;
    let blinkDur = 1;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      radm = radmFor();
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

      const headDiv = 15 - transRef.current * 10; // snappy ↔ smooth (as fish)
      const ax = (Math.cos(3 * frm) * rad * w) / h;
      const ay = (Math.sin(4 * frm) * rad * h) / w;

      leadPX = leadX;
      leadPY = leadY;
      leadX += (ax + pointer.x - leadX) / headDiv;
      leadY += (ay + pointer.y - leadY) / headDiv;
      // Shell trails the lead a touch → it banks into turns.
      bodyX += (leadX - bodyX) / 6;
      bodyY += (leadY - bodyY) / 6;

      const headingF = Math.atan2(leadY - bodyY, leadX - bodyX);
      let dh = headingF - prevHeading;
      if (dh > Math.PI) dh -= 2 * Math.PI;
      else if (dh < -Math.PI) dh += 2 * Math.PI;
      prevHeading = headingF;
      turnSigned = turnSigned * 0.85 + dh * 0.15;
      const turnMag = Math.abs(turnSigned);
      speed =
        speed * 0.85 +
        Math.hypot(leadX - leadPX, leadY - leadPY) * 0.15;

      const sizeMul = sizeRef.current;
      const s = 1.4 * sizeMul;
      // Turtle faces -x; rotate by the backward direction, leaning into turns.
      const rotDeg =
        (Math.atan2(bodyY - leadY, bodyX - leadX) * 180) / Math.PI +
        turnSigned * 40;

      // Stroke cadence quickens with speed + turning.
      flipPhase += 0.18 + Math.min(1.7, speed * 0.05 + turnMag * 9);

      // Root transform: gentle bob, or a gelatinous wobble in jelly mode.
      const jON = jellyRef.current;
      if (jON) {
        wob += 0.05;
        const sx = s * (1 + 0.05 * Math.sin(wob));
        const sy = s * (1 + 0.05 * Math.sin(wob + 1.6));
        root.setAttribute(
          "transform",
          `translate(${bodyX.toFixed(1)},${bodyY.toFixed(1)}) rotate(${rotDeg.toFixed(
            2
          )}) scale(${sx.toFixed(3)},${sy.toFixed(3)})`
        );
        root.setAttribute("opacity", "0.55");
      } else {
        const bob = 1 + 0.02 * Math.sin(flipPhase);
        root.setAttribute(
          "transform",
          `translate(${bodyX.toFixed(1)},${bodyY.toFixed(1)}) rotate(${rotDeg.toFixed(
            2
          )}) scale(${(s * bob).toFixed(3)})`
        );
        root.setAttribute("opacity", "1");
      }

      // Colours (live).
      const baseHue = hueRef.current;
      if (jON) {
        const jh = baseHue ?? 270; // translucent violet/cyan jelly
        setStops(shellGrad, `hsl(${jh}, 75%, 72%)`, `hsl(${jh}, 80%, 56%)`);
        setStops(finGrad, `hsl(${jh}, 72%, 74%)`, `hsl(${jh}, 76%, 60%)`);
        scutes?.setAttribute("opacity", "0.12");
      } else {
        const sh = baseHue ?? 135; // green turtle by default
        setStops(shellGrad, `hsl(${sh}, 48%, 55%)`, `hsl(${sh}, 52%, 32%)`);
        const fh = finHueRef.current ?? 130;
        setStops(finGrad, `hsl(${fh}, 52%, 52%)`, `hsl(${fh}, 55%, 35%)`);
        const ph = antHueRef.current ?? Math.max(0, (baseHue ?? 135) - 8);
        scutes?.setAttribute("stroke", `hsl(${ph}, 45%, 24%)`);
        scutes?.setAttribute("opacity", "0.85");
      }

      // Front flippers — synchronised "flying" stroke (mirrored).
      const fSize = finSizeRef.current;
      const ampF = 14 + Math.min(22, speed * 1.4 + turnMag * 130);
      const fAng = ampF * Math.sin(flipPhase);
      frontL?.setAttribute(
        "transform",
        `translate(-6 -8) rotate(${fAng.toFixed(2)}) scale(${fSize.toFixed(3)})`
      );
      frontR?.setAttribute(
        "transform",
        `translate(-6 8) rotate(${(-fAng).toFixed(2)}) scale(${fSize.toFixed(3)})`
      );

      // Rear flippers — rudder (steer toward the turn) + slow wobble.
      const steer = Math.max(-26, Math.min(26, turnSigned * 220));
      const rWob = 4 * Math.sin(flipPhase * 0.6);
      rearL?.setAttribute(
        "transform",
        `translate(8 -7) rotate(${(steer + rWob).toFixed(2)}) scale(${fSize.toFixed(
          3
        )})`
      );
      rearR?.setAttribute(
        "transform",
        `translate(8 7) rotate(${(steer - rWob).toFixed(2)}) scale(${fSize.toFixed(
          3
        )})`
      );

      // Tail — sways opposite the steer.
      tail?.setAttribute(
        "transform",
        `translate(13 0) rotate(${(-steer * 0.5 + 3 * Math.sin(flipPhase * 0.5)).toFixed(
          2
        )})`
      );

      // Head — extends forward (-x) with speed, gentle bob.
      const extend = -Math.min(2.5, speed * 0.25);
      const hbob = 0.6 * Math.sin(flipPhase);
      head?.setAttribute(
        "transform",
        `translate(${extend.toFixed(2)} ${hbob.toFixed(2)})`
      );

      // Eye blink.
      if (eye2) {
        const spd = blinkSpeedRef.current;
        if (blinkProg > 0) {
          blinkProg -= 1;
          const phase = 1 - blinkProg / blinkDur;
          const open = Math.max(0.08, Math.abs(Math.cos(phase * Math.PI)));
          eye2.setAttribute(
            "transform",
            `translate(-21.5 1.6) scale(1 ${open.toFixed(3)})`
          );
        } else {
          blinkWait -= spd;
          if (blinkWait <= 0) {
            const slow = Math.random() < 0.25;
            const baseDur = slow ? 26 + Math.random() * 12 : 7 + Math.random() * 4;
            blinkDur = Math.max(3, baseDur / spd);
            blinkProg = blinkDur;
            blinkWait = 50 + Math.random() * 130;
          } else {
            eye2.setAttribute("transform", "translate(-21.5 1.6)");
          }
        }
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
          <radialGradient id="t-shell-grad" cx="40%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#4caf50" />
            <stop offset="100%" stopColor="#2e7d32" />
          </radialGradient>
          <linearGradient id="t-fin-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4caf50" />
            <stop offset="100%" stopColor="#2e7d32" />
          </linearGradient>
        </defs>

        {/* The whole turtle; JS sets its transform/opacity each frame. */}
        <g id="turtle">
          {/* Rear flippers (rudders) — behind the shell. */}
          <g id="t-rear-flipper-l" transform="translate(8 -7)">
            <path d="M0 0 C 2 -4 7 -6 11 -5 C 8 -2 4 -1 0 1 Z" fill="url(#t-fin-grad)" />
          </g>
          <g id="t-rear-flipper-r" transform="translate(8 7)">
            <path d="M0 0 C 2 4 7 6 11 5 C 8 2 4 1 0 -1 Z" fill="url(#t-fin-grad)" />
          </g>

          {/* Front flippers (thrust) — partly behind the shell. */}
          <g id="t-front-flipper-l" transform="translate(-6 -8)">
            <path d="M0 0 C -3 -5 -10 -9 -16 -8 C -12 -4 -6 -2 1 2 Z" fill="url(#t-fin-grad)" />
          </g>
          <g id="t-front-flipper-r" transform="translate(-6 8)">
            <path d="M0 0 C -3 5 -10 9 -16 8 C -12 4 -6 2 1 -2 Z" fill="url(#t-fin-grad)" />
          </g>

          {/* Tail. */}
          <g id="t-tail" transform="translate(13 0)">
            <path d="M0 -1.8 L6 0 L0 1.8 Z" fill="url(#t-fin-grad)" />
          </g>

          {/* Head + neck + eyes (head protrudes past the shell front). */}
          <g id="t-head">
            <path
              d="M-12 -3 Q-17 -2.6 -20 0 Q-17 2.6 -12 3 Z"
              fill="url(#t-shell-grad)"
            />
            <ellipse cx="-20" cy="0" rx="4" ry="3.2" fill="url(#t-shell-grad)" />
            {/* eyes — light eyeball, pupil offset toward the front (-x) */}
            <circle cx="-21.5" cy="-1.6" r="1" fill="#eaf6fb" />
            <circle cx="-21.9" cy="-1.6" r="0.6" fill="#0b1722" />
            <circle cx="-22.1" cy="-1.85" r="0.22" fill="#ffffff" />
            <g id="t-eye2" transform="translate(-21.5 1.6)">
              <circle cx="0" cy="0" r="1" fill="#eaf6fb" />
              <circle cx="-0.4" cy="0" r="0.6" fill="#0b1722" />
              <circle cx="-0.6" cy="-0.25" r="0.22" fill="#ffffff" />
            </g>
          </g>

          {/* Carapace (shell) on top, with the scute pattern. */}
          <ellipse
            cx="0"
            cy="0"
            rx="14"
            ry="11"
            fill="url(#t-shell-grad)"
            stroke="#1b5e20"
            strokeWidth="0.8"
          />
          <g
            id="t-scutes"
            fill="none"
            stroke="#1b5e20"
            strokeWidth="0.6"
            strokeLinecap="round"
          >
            {/* central column edges */}
            <path d="M-12 -3.6 Q0 -4 12 -3" />
            <path d="M-12 3.6 Q0 4 12 3" />
            {/* transverse plate dividers */}
            <path d="M-7 -10 Q-7.5 0 -7 10" />
            <path d="M-1 -10.6 Q-1.5 0 -1 10.6" />
            <path d="M5 -10 Q4.5 0 5 10" />
            <path d="M10 -7 Q9.5 0 10 7" />
            {/* marginal hints */}
            <path d="M-10 -8 Q0 -9.5 11.5 -6" />
            <path d="M-10 8 Q0 9.5 11.5 6" />
          </g>
        </g>
      </svg>
    </div>
  );
}

export default TurtleCursor;
