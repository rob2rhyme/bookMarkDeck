// Shared "baby creature" trail used by the chain-based overlays (fish, dragon).
// Each baby is a compact <use> of a rig symbol that faces -x; the babies trail
// the parent's recent path and fan out to alternating sides — the same feel as
// the turtle's babies, driven by the same settings (count / distance / spread /
// size). Returns an update(cx, cy, parentScale) to call once per frame.

import type { RefObject } from "react";

export type BabyRefs = {
  on: RefObject<boolean>;
  count: RefObject<number>;
  gap: RefObject<number>;
  spread: RefObject<number>;
  size: RefObject<number>;
};

export function setupBabies(
  container: SVGGElement,
  rigId: string,
  refs: BabyRefs,
  max = 100
) {
  const xmlns = "http://www.w3.org/2000/svg";
  const xlinkns = "http://www.w3.org/1999/xlink";

  const els: SVGGElement[] = [];
  for (let i = 0; i < max; i++) {
    const g = document.createElementNS(xmlns, "g") as SVGGElement;
    g.setAttribute("opacity", "0");
    const use = document.createElementNS(xmlns, "use") as SVGUseElement;
    use.setAttributeNS(xlinkns, "xlink:href", "#" + rigId);
    g.appendChild(use);
    container.appendChild(g);
    els.push(g);
  }

  const trail: { x: number; y: number }[] = [];
  const rot = els.map(() => 0);
  let tick = 0;

  const update = (cx: number, cy: number, parentScale: number) => {
    tick += 1;
    trail.unshift({ x: cx, y: cy });
    if (trail.length > 4100) trail.pop(); // covers 100 babies × max spacing

    const nb = refs.on.current
      ? Math.min(els.length, Math.round(refs.count.current))
      : 0;
    const gap = refs.gap.current;
    const spread = refs.spread.current;
    const size = refs.size.current;

    els.forEach((g, i) => {
      if (i >= nb) {
        if (g.getAttribute("opacity") !== "0") g.setAttribute("opacity", "0");
        return;
      }
      const idx = Math.min(trail.length - 1, Math.round((i + 1) * gap));
      const p = trail[idx];
      const ahead = trail[Math.max(0, idx - 5)];
      const vx = p.x - ahead.x;
      const vy = p.y - ahead.y;
      if (Math.hypot(vx, vy) > 0.6)
        rot[i] = (Math.atan2(vy, vx) * 180) / Math.PI;
      // Fan sideways: alternate L/R, widening with rank, perpendicular to the
      // heading — so they follow from the side, not just straight behind.
      const side = i % 2 === 0 ? 1 : -1;
      const rank = Math.floor(i / 2) + 1;
      const lateral = spread * side * rank;
      const rad = (rot[i] * Math.PI) / 180;
      const bx = p.x + -Math.sin(rad) * lateral;
      const by = p.y + Math.cos(rad) * lateral;
      const bs = parentScale * size * (1 + 0.03 * Math.sin(tick * 0.2 + i * 1.3));
      g.setAttribute(
        "transform",
        `translate(${bx.toFixed(1)},${by.toFixed(1)}) rotate(${rot[i].toFixed(
          2
        )}) scale(${bs.toFixed(3)})`
      );
      g.setAttribute("opacity", "1");
    });
  };

  return { update };
}
