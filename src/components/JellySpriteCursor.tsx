// src/components/JellySpriteCursor.tsx
"use client";

// A jellyfish cursor overlay that uses the EXACT supplied artwork
// (/jellyfish-cursor.svg, a flattened self-masked PNG) as a single sprite. It
// eases after the pointer with the shared follow feel + lazy idle re-centre,
// plus a buoyant bob/sway, a slow bell "pulse" (squash/stretch), and a gentle
// lean into horizontal movement. The tentacles are baked into the image, so
// this variant can't undulate them (see JellyfishCursor for the procedural,
// fully-animated version). Shares the overlay settings: size, colour
// (hue-rotate / translucent jelly), transition, and trailing babies. Skipped
// under prefers-reduced-motion.

import { useEffect, useRef } from "react";

import { setupBabies } from "@/components/cursorBabies";
import type { CursorProps } from "@/lib/cursorSettings";

// The supplied art is centred in a 1440×810 canvas; reference it whole and
// centre it on the local origin.
const ART_W = 1440;
const ART_H = 810;

export function JellySpriteCursor({
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
    const root = svg.querySelector<SVGGElement>("#jellyimg");
    if (!root) return;

    const babyGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    ) as SVGGElement;
    svg.querySelector("#jellyimg-babies")?.appendChild(babyGroup);
    const babyRig = setupBabies(
      babyGroup,
      "jellyimg-rig",
      {
        on: babiesRef,
        count: babyCountRef,
        gap: babyGapRef,
        spread: babySpreadRef,
        size: babySizeRef,
      },
      { upright: true }
    );

    // Water FX (world-space, behind the sprite): ripple rings + rising bubbles.
    const svgns = "http://www.w3.org/2000/svg";
    const fx = svg.querySelector<SVGGElement>("#jellyimg-fx");
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
    let lastRing = 0;
    let bubbleTimer = 0;

    let w = window.innerWidth;
    let h = window.innerHeight;
    const pointer = { x: w / 2, y: h / 2 };
    let bodyX = pointer.x;
    let bodyY = pointer.y;
    let frm = Math.random();
    let pulse = 0;
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

      const headDiv = 15 - transRef.current * 10;
      const ax = (Math.cos(3 * frm) * rad * w) / h;
      const ay = (Math.sin(4 * frm) * rad * h) / w;
      const pbx = bodyX;
      bodyX += (ax + pointer.x - bodyX) / headDiv;
      bodyY += (ay + pointer.y - bodyY) / headDiv;
      const velX = bodyX - pbx;

      const sizeMul = sizeRef.current;
      const s = 0.2 * sizeMul; // sprite ≈ 160px tall at 100%

      pulse += 0.06;
      const bobY = Math.sin(frm * 7) * 5 * sizeMul;
      const bobX = Math.cos(frm * 5) * 3 * sizeMul;
      const sx = s * (1 - 0.05 * Math.sin(pulse));
      const sy = s * (1 + 0.06 * Math.sin(pulse));
      const lean = Math.max(-12, Math.min(12, velX * 1.4));

      root.setAttribute(
        "transform",
        `translate(${(bodyX + bobX).toFixed(1)},${(bodyY + bobY).toFixed(
          1
        )}) rotate(${lean.toFixed(2)}) scale(${sx.toFixed(3)},${sy.toFixed(3)})`
      );

      const jel = jellyRef.current;
      const hv = hueRef.current;
      let filter = "";
      if (jel) filter += "saturate(0.7) brightness(1.12) ";
      if (hv != null) filter += `hue-rotate(${hv}deg)`;
      filter = filter.trim();
      root.style.filter = filter;
      root.setAttribute("opacity", jel ? "0.5" : "0.95");

      babyRig.update(bodyX + bobX, bodyY + bobY, s);
      babyGroup.style.filter = filter;
      babyGroup.setAttribute("opacity", jel ? "0.5" : "0.95");

      // 〜 Ripple rings — one per bell pulse, faster while moving.
      const ringId = Math.floor(pulse / Math.PI);
      if (ringId !== lastRing) {
        lastRing = ringId;
        const rp = ripplePool.find((p) => p.life <= 0);
        if (rp) {
          rp.x = bodyX + bobX;
          rp.y = bodyY + bobY;
          rp.scale = sizeMul;
          rp.r0 = 34 * sizeMul;
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
        rp.el.setAttribute("r", (rp.r0 + t * 20 * rp.scale).toFixed(1));
        rp.el.setAttribute("opacity", ((1 - t) * 0.45).toFixed(3));
      }

      // 🫧 Bubbles — rise from the bell top, drifting as they fade.
      bubbleTimer -= 1;
      if (bubbleTimer <= 0) {
        const b = bubblePool.find((p) => p.life <= 0);
        if (b) {
          b.x = bodyX + bobX + (Math.random() - 0.5) * 50 * sizeMul;
          b.y = bodyY + bobY - 55 * sizeMul;
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
          <g id="jellyimg-rig">
            <image
              href="/jellyfish-cursor.svg"
              x={-ART_W / 2}
              y={-ART_H / 2}
              width={ART_W}
              height={ART_H}
              preserveAspectRatio="xMidYMid meet"
            />
          </g>
        </defs>

        <g id="jellyimg-fx" />
        <g id="jellyimg-babies" />
        <g id="jellyimg" opacity="0">
          <use href="#jellyimg-rig" />
        </g>
      </svg>
    </div>
  );
}

export default JellySpriteCursor;
