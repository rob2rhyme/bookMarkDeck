// Pure builders for printable QR location labels. Scanning a label opens the
// app filtered to that location — check a sealed box without unpacking it. The
// QR SVG is rendered elsewhere (qr.ts); everything here is pure + tested.

export type LocationLabel = {
  id: string;
  name: string;
  path: string[]; // root→leaf breadcrumb
  count: number; // items directly in this location
  qrSvg: string; // pre-rendered inline <svg>…</svg>
};

/** The deep link a label's QR encodes. Absolute so a phone camera can open it. */
export function labelUrl(origin: string, id: string): string {
  return `${origin.replace(/\/$/, "")}/inventory?location=${encodeURIComponent(id)}`;
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  );

/**
 * A complete, self-contained printable HTML document: a grid of cut-out label
 * cards (QR + location name + breadcrumb + item count), sized for easy
 * scissoring. Pure — the caller writes it into a hidden iframe and prints.
 */
export function locationLabelsHtml(labels: LocationLabel[], title = "My Stuff — location labels"): string {
  const cards = labels
    .map(
      (l) => `
      <div class="label">
        <div class="qr">${l.qrSvg}</div>
        <div class="meta">
          <div class="name">${esc(l.name)}</div>
          ${l.path.length > 1 ? `<div class="path">${esc(l.path.slice(0, -1).join(" › "))}</div>` : ""}
          <div class="count">${l.count} item${l.count === 1 ? "" : "s"}</div>
        </div>
      </div>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 24px; color: #0f172a; }
  h1 { font-size: 16px; margin: 0 0 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .label { border: 1px dashed #94a3b8; border-radius: 10px; padding: 12px; display: flex; gap: 12px; align-items: center; page-break-inside: avoid; }
  .qr { width: 96px; height: 96px; flex: none; }
  .qr svg { width: 100%; height: 100%; }
  .meta { min-width: 0; }
  .name { font-weight: 700; font-size: 15px; word-break: break-word; }
  .path { color: #64748b; font-size: 11px; margin-top: 2px; }
  .count { color: #475569; font-size: 12px; margin-top: 4px; }
  @media print { body { margin: 0; } h1 { display: none; } }
</style></head>
<body>
  <h1>${esc(title)}</h1>
  <div class="grid">${cards}</div>
</body></html>`;
}
