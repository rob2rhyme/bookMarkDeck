// src/components/LobsterCursor.tsx
"use client";

// A procedural lobster cursor overlay (styled after the classic Homard plate:
// teal-blue body, orange-tipped claws, yellow leg joints). It follows the
// pointer with the same eased lead→body chain as the turtle (banks into turns),
// and is fully articulated: two big claws that sway + open/close, four pairs of
// walking legs that step, long antennae that whip, beady stalk-eyes, and a
// six-segment abdomen that flexes — curling under for a tail-flip dart when it
// moves fast. Leaves a water wake (ripples + bubbles). All motion is procedural
// and lives in the rig, so trailing babies (live <use> mirrors) crawl too.
// Reads live settings via refs; skipped under prefers-reduced-motion.

import { useEffect, useRef } from "react";

import { setupBabies } from "@/components/cursorBabies";
import type { CursorProps } from "@/lib/cursorSettings";

const SEGS = 6; // abdomen (tail) segments

export function LobsterCursor({
  size = 1,
  hue = null,
  finHue = null,
  antennaHue = null,
  finSize = 1,
  transition = 0.5,
  tailSpeed = 1,
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
  const finHueRef = useRef(finHue);
  const antHueRef = useRef(antennaHue);
  const finSizeRef = useRef(finSize);
  const transRef = useRef(transition);
  const tailSpeedRef = useRef(tailSpeed);
  const jellyRef = useRef(jelly);
  const babiesRef = useRef(babies);
  const babyCountRef = useRef(babyCount);
  const babyGapRef = useRef(babyGap);
  const babySpreadRef = useRef(babySpread);
  const babySizeRef = useRef(babySize);
  useEffect(() => {
    sizeRef.current = size;
    hueRef.current = hue;
    finHueRef.current = finHue;
    antHueRef.current = antennaHue;
    finSizeRef.current = finSize;
    transRef.current = transition;
    tailSpeedRef.current = tailSpeed;
    jellyRef.current = jelly;
    babiesRef.current = babies;
    babyCountRef.current = babyCount;
    babyGapRef.current = babyGap;
    babySpreadRef.current = babySpread;
    babySizeRef.current = babySize;
  }, [
    size,
    hue,
    finHue,
    antennaHue,
    finSize,
    transition,
    tailSpeed,
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

    const root = q<SVGGElement>("#lobster");
    if (!root) return;
    const bodyGrad = q<SVGLinearGradientElement>("#lob-body-grad");
    const clawGrad = q<SVGLinearGradientElement>("#lob-claw-grad");
    const clawL = q<SVGGElement>("#lob-claw-l");
    const clawR = q<SVGGElement>("#lob-claw-r");
    const pincerL = q<SVGGElement>("#lob-pincer-l");
    const pincerR = q<SVGGElement>("#lob-pincer-r");
    const antL = q<SVGPathElement>("#lob-ant-l");
    const antR = q<SVGPathElement>("#lob-ant-r");
    const legs = Array.from(svg.querySelectorAll<SVGGElement>(".lob-leg"));
    const segEls: (SVGGElement | null)[] = [];
    for (let i = 0; i < SEGS; i++) segEls.push(q<SVGGElement>(`#lob-seg-${i}`));
    const legGroup = q<SVGGElement>("#lob-legs");

    // Babies — trailing baby lobsters (rotate to face travel, like the parent).
    const babyGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    ) as SVGGElement;
    q("#lob-babies")?.appendChild(babyGroup);
    const babyRig = setupBabies(babyGroup, "lobster-rig", {
      on: babiesRef,
      count: babyCountRef,
      gap: babyGapRef,
      spread: babySpreadRef,
      size: babySizeRef,
    });

    // Water FX (world-space, behind the lobster): ripples + bubbles.
    const svgns = "http://www.w3.org/2000/svg";
    const fx = q<SVGGElement>("#lob-fx");
    type Ripple = { el: SVGCircleElement; x: number; y: number; r0: number; life: number; max: number; scale: number };
    type Bub = { el: SVGCircleElement; x: number; y: number; vy: number; life: number; max: number };
    const ripplePool: Ripple[] = [];
    const bubblePool: Bub[] = [];
    if (fx) {
      for (let i = 0; i < 8; i++) {
        const c = document.createElementNS(svgns, "circle");
        c.setAttribute("fill", "none");
        c.setAttribute("stroke", "#bae6fd");
        c.setAttribute("stroke-width", "1.4");
        c.setAttribute("opacity", "0");
        fx.appendChild(c);
        ripplePool.push({ el: c, x: 0, y: 0, r0: 0, life: 0, max: 1, scale: 1 });
      }
      for (let i = 0; i < 28; i++) {
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
    let leadX = pointer.x;
    let leadY = pointer.y;
    let leadPX = leadX;
    let leadPY = leadY;
    let bodyX = pointer.x;
    let bodyY = pointer.y;
    let prevHeading = 0;
    let turnSigned = 0;
    let speed = 0;
    let frm = Math.random();
    let legPhase = 0;
    let tailPhase = 0;
    let antPhase = 0;
    let rad = 0;
    let radm = Math.min(pointer.x, pointer.y) - 20;
    let rippleTimer = 0;
    let bubbleTimer = 0;

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

      const headDiv = 15 - transRef.current * 10;
      const ax = (Math.cos(3 * frm) * rad * w) / h;
      const ay = (Math.sin(4 * frm) * rad * h) / w;

      leadPX = leadX;
      leadPY = leadY;
      leadX += (ax + pointer.x - leadX) / headDiv;
      leadY += (ay + pointer.y - leadY) / headDiv;
      bodyX += (leadX - bodyX) / 6;
      bodyY += (leadY - bodyY) / 6;

      const headingF = Math.atan2(leadY - bodyY, leadX - bodyX);
      let dh = headingF - prevHeading;
      if (dh > Math.PI) dh -= 2 * Math.PI;
      else if (dh < -Math.PI) dh += 2 * Math.PI;
      prevHeading = headingF;
      turnSigned = turnSigned * 0.85 + dh * 0.15;
      const turnMag = Math.abs(turnSigned);
      speed = speed * 0.85 + Math.hypot(leadX - leadPX, leadY - leadPY) * 0.15;

      const sizeMul = sizeRef.current;
      const s = 2.4 * sizeMul;

      // Faces -x; rotate by the backward direction, leaning into turns.
      const rotDeg =
        (Math.atan2(bodyY - leadY, bodyX - leadX) * 180) / Math.PI +
        turnSigned * 30;
      root.setAttribute(
        "transform",
        `translate(${bodyX.toFixed(1)},${bodyY.toFixed(1)}) rotate(${rotDeg.toFixed(
          2
        )}) scale(${s.toFixed(3)})`
      );

      // Walk cycle — legs mostly step while it moves; barely shuffle at rest.
      legPhase += 0.04 + Math.min(0.8, speed * 0.1);
      const legAmp = 4 + Math.min(13, speed * 1.5);
      for (let i = 0; i < legs.length; i++) {
        // alternate sides + front-to-back phase for a crawl
        const side = i % 2 === 0 ? 1 : -1;
        const ph = legPhase + Math.floor(i / 2) * 0.9 + (side > 0 ? 0 : Math.PI);
        const ang = legAmp * Math.sin(ph);
        const base = legs[i].getAttribute("data-base") || "0 0";
        legs[i].setAttribute(
          "transform",
          `translate(${base}) rotate(${ang.toFixed(2)})`
        );
      }

      // How "active" the lobster is right now (0 at rest → 1 darting/turning).
      const drive = Math.min(1, speed * 0.28 + turnMag * 7);

      // Carpus (claw arms) held WIDE open — a hug-ready spread (~75% wider than
      // the old rest pose) — plus swing into the turn and open a touch more when
      // active.
      const fz = finSizeRef.current;
      const clawSwing = turnSigned * 45;
      const lift = drive * 11;
      const open = 32; // wide carpus spread
      clawL?.setAttribute("transform", `translate(-9 -6) rotate(${(-8 - open - lift + clawSwing).toFixed(2)}) scale(${fz.toFixed(3)})`);
      clawR?.setAttribute("transform", `translate(-9 6) rotate(${(8 + open + lift + clawSwing).toFixed(2)}) scale(${fz.toFixed(3)})`);
      // Pincers gape REACTIVELY: open as it moves/turns, resting nearly shut.
      const gape = 2 + drive * 16;
      pincerL?.setAttribute("transform", `rotate(${(-gape).toFixed(2)})`);
      pincerR?.setAttribute("transform", `rotate(${gape.toFixed(2)})`);

      // Antennae — REACTIVE: sweep forward at rest, drag backward as it swims,
      // sway into the turn, with a wave whose amplitude tracks activity.
      antPhase += 0.08 + Math.min(0.7, speed * 0.12);
      const drag = Math.min(14, speed * 1.8); // tips pulled back when swimming
      const aSway = 0.5 + drive * 1.6;
      const buildAnt = (sign: number) => {
        // Long feelers from beside the rostrum, sweeping forward + outward.
        let d = `M -16 ${(sign * 1.5).toFixed(1)}`;
        for (let k = 1; k <= 9; k++) {
          const t = k / 9;
          const xx = -16 - t * 56 + drag * t * t;
          const yy =
            sign * (1.5 + t * 22) +
            Math.sin(t * 3 + antPhase + sign) * (0.8 + t * 2) * aSway +
            turnSigned * 12 * t;
          d += ` L ${xx.toFixed(1)} ${yy.toFixed(1)}`;
        }
        return d;
      };
      antL?.setAttribute("d", buildAnt(-1));
      antR?.setAttribute("d", buildAnt(1));

      // Abdomen — REACTIVE: a travelling undulation that grows with speed, plus
      // a gentle uniform lean into the turn. No constant one-sided curl, so it
      // ripples symmetrically as it swims instead of locking bent to one side.
      // Calmer base rate, scaled by the Tail-motion setting (0 = still).
      tailPhase += (0.05 + Math.min(0.6, speed * 0.1)) * tailSpeedRef.current;
      const waveAmp = 1.4 + Math.min(8, speed * 1.2);
      const lean = turnSigned * 7;
      for (let i = 0; i < SEGS; i++) {
        const ang = waveAmp * Math.sin(tailPhase - i * 0.6) + lean;
        segEls[i]?.setAttribute("transform", `translate(3 0) rotate(${ang.toFixed(2)})`);
      }

      // Colours (live). Body teal/blue; claws blue w/ fixed orange tips; legs
      // a touch warmer. Jelly = translucent + paler.
      const jel = jellyRef.current;
      const bh = hueRef.current ?? 190; // teal
      const ch = finHueRef.current ?? 210; // claws
      const lh = antHueRef.current ?? 200; // legs/antennae
      if (jel) {
        setStops(bodyGrad, `hsl(${bh}, 55%, 85%)`, `hsl(${bh}, 55%, 66%)`);
        setStops(clawGrad, `hsl(${ch}, 55%, 84%)`, `hsl(${ch}, 55%, 64%)`);
        root.setAttribute("opacity", "0.45");
      } else {
        setStops(bodyGrad, `hsl(${bh}, 62%, 58%)`, `hsl(${bh}, 70%, 30%)`);
        setStops(clawGrad, `hsl(${ch}, 58%, 52%)`, `hsl(${ch}, 72%, 26%)`);
        root.setAttribute("opacity", "1");
      }
      legGroup?.setAttribute("stroke", `hsl(${lh}, 60%, 45%)`);
      if (antL) antL.style.stroke = `hsl(35, 75%, 50%)`; // antennae stay coppery
      if (antR) antR.style.stroke = `hsl(35, 75%, 50%)`;

      // Babies trail the body (mirror the live rig: legs/claws/tail animate).
      babyRig.update(bodyX, bodyY, s);
      babyGroup.setAttribute("opacity", jel ? "0.45" : "1");

      // 〜 Ripples — faint kicks as it crawls, faster while moving.
      if (fx) {
        rippleTimer -= 1 + speed * 0.3;
        if (rippleTimer <= 0) {
          const rp = ripplePool.find((p) => p.life <= 0);
          if (rp) {
            rp.x = bodyX; rp.y = bodyY; rp.scale = s;
            rp.r0 = 9 * s; rp.max = 42 + Math.random() * 18; rp.life = rp.max;
          }
          rippleTimer = 22 + Math.random() * 14;
        }
        for (const rp of ripplePool) {
          if (rp.life <= 0) continue;
          rp.life -= 1;
          const t = 1 - rp.life / rp.max;
          rp.el.setAttribute("cx", rp.x.toFixed(1));
          rp.el.setAttribute("cy", rp.y.toFixed(1));
          rp.el.setAttribute("r", (rp.r0 + t * 22 * rp.scale).toFixed(1));
          rp.el.setAttribute("opacity", ((1 - t) * 0.55).toFixed(3));
        }

        // 🫧 Bubbles — from the head, drifting up.
        bubbleTimer -= 1;
        if (bubbleTimer <= 0) {
          const b = bubblePool.find((p) => p.life <= 0);
          if (b) {
            const fa = prevHeading; // toward the head (-x faces forward)
            b.x = bodyX + Math.cos(fa) * 14 * s + (Math.random() - 0.5) * 8;
            b.y = bodyY + Math.sin(fa) * 14 * s;
            b.vy = -(0.5 + Math.random() * 0.7);
            b.max = 70 + Math.random() * 40;
            b.life = b.max;
            b.el.setAttribute("r", (1.5 + Math.random() * 1.6).toFixed(2));
          }
          bubbleTimer = 7 + Math.random() * 10;
        }
        for (const b of bubblePool) {
          if (b.life <= 0) continue;
          b.life -= 1;
          b.x += Math.sin(b.life * 0.15) * 0.25;
          b.y += b.vy;
          const alpha = Math.max(0, b.life / b.max);
          b.el.setAttribute("cx", b.x.toFixed(1));
          b.el.setAttribute("cy", b.y.toFixed(1));
          b.el.setAttribute("opacity", (alpha * 0.65).toFixed(3));
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

  // Leg base positions along the thorax (x, ±y); the JS rotates each about it.
  const LEGS = [
    [-7, -7], [-7, 7],
    [-3, -8], [-3, 8],
    [1, -8], [1, 8],
    [5, -7], [5, 7],
  ];

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
          <linearGradient id="lob-body-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3fb6c4" />
            <stop offset="100%" stopColor="#15506b" />
          </linearGradient>
          <linearGradient id="lob-claw-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3a7fc0" />
            <stop offset="100%" stopColor="#15375f" />
          </linearGradient>
        </defs>

        <g id="lob-fx" />
        <g id="lob-babies" />

        {/* The lobster; JS sets #lobster's transform each frame, the rig holds
            the articulated body that babies mirror. Faces -x (forward). */}
        <g id="lobster" opacity="0">
          <g id="lobster-rig">
            {/* Antennae (behind body), animated wavy whips. */}
            <path id="lob-ant-l" d="M-15 -3 L-45 -12" fill="none" stroke="#cc7a22" strokeWidth="0.8" strokeLinecap="round" />
            <path id="lob-ant-r" d="M-15 3 L-45 12" fill="none" stroke="#cc7a22" strokeWidth="0.8" strokeLinecap="round" />

            {/* Walking legs — eight, each rotated about its hip. */}
            <g id="lob-legs" fill="none" stroke="#2f7fa0" strokeWidth="1.6" strokeLinecap="round">
              {LEGS.map(([x, y], i) => {
                const dir = y < 0 ? -1 : 1;
                return (
                  <g key={i} className="lob-leg" data-base={`${x} ${y}`} transform={`translate(${x} ${y})`}>
                    <path d={`M0 0 L${-2} ${dir * 7} L${-5} ${dir * 12}`} />
                    {/* tiny claw tip */}
                    <path d={`M${-5} ${dir * 12} l${-1.5} ${dir * 1.5}`} stroke="#d6b53a" strokeWidth="1.2" />
                  </g>
                );
              })}
            </g>

            {/* Claws — jointed arm (merus + carpus) → bulky hand (propodus)
                with a fixed finger + a movable finger (the gaping pincer). */}
            <g id="lob-claw-l" transform="translate(-9 -6)">
              {/* arm */}
              <path d="M0 -2.6 L-7 -3.2 L-13 -2.8 L-13 2.8 L-7 3.2 L0 2.6 Z" fill="url(#lob-claw-grad)" stroke="#13324f" strokeWidth="0.4" />
              {/* hand / palm */}
              <path d="M-12 -4.6 Q-21 -7.6 -26 -2.4 Q-27.5 0 -26 2 Q-21 4.2 -12 4.4 Z" fill="url(#lob-claw-grad)" stroke="#13324f" strokeWidth="0.4" />
              {/* fixed finger (pollex) */}
              <path d="M-24.5 2.4 Q-33 4 -37.5 0.8 Q-34 -0.2 -27 0.6 Z" fill="url(#lob-claw-grad)" stroke="#13324f" strokeWidth="0.4" />
              {/* movable finger (dactyl) — hinged at the palm tip, gapes open */}
              <g transform="translate(-25 -1.6)">
                <g id="lob-pincer-l">
                  <path d="M0 0.4 Q-8 -2.6 -13 -0.2 Q-9 1.2 -2 1.4 Z" fill="url(#lob-claw-grad)" stroke="#13324f" strokeWidth="0.4" />
                </g>
              </g>
            </g>
            <g id="lob-claw-r" transform="translate(-9 6)">
              <path d="M0 2.6 L-7 3.2 L-13 2.8 L-13 -2.8 L-7 -3.2 L0 -2.6 Z" fill="url(#lob-claw-grad)" stroke="#13324f" strokeWidth="0.4" />
              <path d="M-12 4.6 Q-21 7.6 -26 2.4 Q-27.5 0 -26 -2 Q-21 -4.2 -12 -4.4 Z" fill="url(#lob-claw-grad)" stroke="#13324f" strokeWidth="0.4" />
              <path d="M-24.5 -2.4 Q-33 -4 -37.5 -0.8 Q-34 0.2 -27 -0.6 Z" fill="url(#lob-claw-grad)" stroke="#13324f" strokeWidth="0.4" />
              <g transform="translate(-25 1.6)">
                <g id="lob-pincer-r">
                  <path d="M0 -0.4 Q-8 2.6 -13 0.2 Q-9 -1.2 -2 -1.4 Z" fill="url(#lob-claw-grad)" stroke="#13324f" strokeWidth="0.4" />
                </g>
              </g>
            </g>

            {/* Abdomen (tail) — six flexing segments + a fan, behind +x. */}
            <g id="lob-abdomen" transform="translate(2 0)">
              <g id="lob-seg-0" transform="translate(3 0)">
                <path d="M-2 -6 Q1.5 -7 4 -5.4 L4 5.4 Q1.5 7 -2 6 Z" fill="url(#lob-body-grad)" stroke="#d6b53a" strokeWidth="0.5" />
                <g id="lob-seg-1" transform="translate(3 0)">
                  <path d="M-2 -5.4 Q1.5 -6.4 4 -4.9 L4 4.9 Q1.5 6.4 -2 5.4 Z" fill="url(#lob-body-grad)" stroke="#d6b53a" strokeWidth="0.5" />
                  <g id="lob-seg-2" transform="translate(3 0)">
                    <path d="M-2 -4.9 Q1.5 -5.8 4 -4.4 L4 4.4 Q1.5 5.8 -2 4.9 Z" fill="url(#lob-body-grad)" stroke="#d6b53a" strokeWidth="0.5" />
                    <g id="lob-seg-3" transform="translate(3 0)">
                      <path d="M-2 -4.4 Q1.5 -5.2 4 -3.9 L4 3.9 Q1.5 5.2 -2 4.4 Z" fill="url(#lob-body-grad)" stroke="#d6b53a" strokeWidth="0.5" />
                      <g id="lob-seg-4" transform="translate(3 0)">
                        <path d="M-2 -3.9 Q1.5 -4.6 4 -3.3 L4 3.3 Q1.5 4.6 -2 3.9 Z" fill="url(#lob-body-grad)" stroke="#d6b53a" strokeWidth="0.5" />
                        <g id="lob-seg-5" transform="translate(3 0)">
                          <path d="M-2 -3.3 Q1 -3.8 3 -2.6 L3 2.6 Q1 3.8 -2 3.3 Z" fill="url(#lob-body-grad)" stroke="#d6b53a" strokeWidth="0.5" />
                          {/* tail fan — uropods + telson */}
                          <g transform="translate(3 0)">
                            <path d="M0 0 Q7 -7 10 -2 Q8 0 6 0.5 Z" fill="url(#lob-body-grad)" stroke="#d6b53a" strokeWidth="0.5" />
                            <path d="M0 0 Q7 7 10 2 Q8 0 6 -0.5 Z" fill="url(#lob-body-grad)" stroke="#d6b53a" strokeWidth="0.5" />
                            <path d="M0 -1.6 Q8 -2 9.5 0 Q8 2 0 1.6 Z" fill="url(#lob-body-grad)" stroke="#d6b53a" strokeWidth="0.5" />
                          </g>
                        </g>
                      </g>
                    </g>
                  </g>
                </g>
              </g>
            </g>

            {/* Cephalothorax (carapace) + rostrum + eyes, drawn on top. */}
            <path
              d="M2 0 Q1 -8 -6 -7.5 Q-13 -7 -16 0 Q-13 7 -6 7.5 Q1 8 2 0 Z"
              fill="url(#lob-body-grad)"
              stroke="#1b5e20"
              strokeWidth="0.5"
            />
            {/* rostrum (long pointed snout) + antennal scales */}
            <path d="M-15 -1.8 L-26 0 L-15 1.8 Z" fill="url(#lob-body-grad)" stroke="#1b5e20" strokeWidth="0.4" />
            <path d="M-15 -2.4 L-21 -3 L-15 -1 Z" fill="url(#lob-body-grad)" stroke="#1b5e20" strokeWidth="0.3" />
            <path d="M-15 2.4 L-21 3 L-15 1 Z" fill="url(#lob-body-grad)" stroke="#1b5e20" strokeWidth="0.3" />
            {/* dorsal midline + carapace mottle hint */}
            <path d="M-15 0 L1 0" fill="none" stroke="#d6b53a" strokeWidth="0.5" opacity="0.6" />
            {/* beady stalk-eyes */}
            <circle cx="-15.5" cy="-2.6" r="1.5" fill="#0b1722" />
            <circle cx="-15.5" cy="2.6" r="1.5" fill="#0b1722" />
            <circle cx="-16" cy="-2.9" r="0.5" fill="#eaf6fb" />
            <circle cx="-16" cy="2.3" r="0.5" fill="#eaf6fb" />
            {/* antennules (short central feelers) */}
            <path d="M-17 -0.6 q-5 -1.2 -8 -0.4" fill="none" stroke="#cc7a22" strokeWidth="0.7" strokeLinecap="round" />
            <path d="M-17 0.6 q-5 1.2 -8 0.4" fill="none" stroke="#cc7a22" strokeWidth="0.7" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </div>
  );
}

export default LobsterCursor;
