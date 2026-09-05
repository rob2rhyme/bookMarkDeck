// Printable labels for the two things you physically touch: the drawer you open
// and the folder you pull. Scanning either opens the app filtered to it.
//
// The research behind ANALYSIS-FILING-LOG.md found that every label ecosystem on
// the market is bin-shaped — nobody sells one shaped for a file folder. So the
// two sheets here are deliberately different objects:
//
//   • PLACE labels are square-ish cards for a drawer front or cabinet door.
//   • FOLDER labels are wide, short strips sized to sit along a folder's front
//     edge or in a wide tab holder, with the QR small and the name dominant —
//     because you read a folder label edge-on in a drawer, not face-on.
//
// Pure — the caller renders the QR (qr.ts) and prints the HTML (printHtml).
// See labels.test.ts.

export type LabelKind = "place" | "folder";

export type FilingLabel = {
  id: string;
  kind: LabelKind;
  name: string;
  /** Root→leaf breadcrumb of where this is. For a folder, its place trail. */
  path: string[];
  /** Folders in a place, or papers in a folder. */
  count: number;
  /** What a place holds, as written on it: "A-J", "Taxes". Places only. */
  contents?: string;
  /** Whose folder it is, when it belongs to someone in particular. */
  party?: string;
  qrSvg: string; // pre-rendered inline <svg>…</svg>
};

/** The deep link a label's QR encodes. Absolute so a phone camera can open it. */
export function labelUrl(origin: string, kind: LabelKind, id: string): string {
  const key = kind === "place" ? "place" : "folder";
  return `${origin.replace(/\/$/, "")}/filing?${key}=${encodeURIComponent(id)}`;
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  );

/** "3 folders" / "1 folder" / "12 papers" — the label's one line of substance. */
export function countLabel(kind: LabelKind, count: number): string {
  const noun = kind === "place" ? "folder" : "paper";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function card(l: FilingLabel): string {
  // A label's own name is the last crumb, so drop it from the trail above.
  const trail = l.path.length > 1 ? l.path.slice(0, -1).join(" › ") : "";
  return `
      <div class="label ${l.kind}">
        <div class="qr">${l.qrSvg}</div>
        <div class="meta">
          ${l.contents ? `<div class="holds">${esc(l.contents)}</div>` : ""}
          <div class="name">${esc(l.name)}</div>
          ${trail ? `<div class="path">${esc(trail)}</div>` : ""}
          <div class="foot">${
            l.party ? `<span class="party">${esc(l.party)}</span>` : ""
          }<span class="count">${esc(countLabel(l.kind, l.count))}</span></div>
        </div>
      </div>`;
}

/**
 * A complete, self-contained printable HTML document. Place labels and folder
 * labels are grouped into their own sheets because they get cut to different
 * shapes — mixing them makes a page nobody can scissor cleanly.
 */
export function filingLabelsHtml(
  labels: FilingLabel[],
  title = "Filing — labels"
): string {
  const places = labels.filter((l) => l.kind === "place");
  const folders = labels.filter((l) => l.kind === "folder");

  const section = (heading: string, list: FilingLabel[], cls: string) =>
    list.length
      ? `<section class="sheet">
           <h2>${esc(heading)}</h2>
           <div class="grid ${cls}">${list.map(card).join("")}</div>
         </section>`
      : "";

  return `<!doctype html><html><head><meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  @page { margin: 10mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         margin: 24px; color: #0f172a; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .hint { color: #64748b; font-size: 12px; margin: 0 0 20px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em;
       color: #64748b; margin: 0 0 8px; }
  .sheet { margin-bottom: 24px; page-break-inside: auto; }
  .grid { display: grid; gap: 8px; }
  /* Drawer fronts: square-ish cards, read face-on. */
  .grid.places { grid-template-columns: repeat(auto-fill, minmax(62mm, 1fr)); }
  /* Folder edges: wide and short, read edge-on in a drawer. */
  .grid.folders { grid-template-columns: repeat(auto-fill, minmax(85mm, 1fr)); }
  .label { border: 1px dashed #94a3b8; border-radius: 3mm; padding: 4mm;
           display: flex; gap: 4mm; align-items: center; page-break-inside: avoid; }
  .label.folder { min-height: 22mm; }
  .label.place { min-height: 30mm; }
  .qr { flex: none; }
  .place .qr { width: 22mm; height: 22mm; }
  .folder .qr { width: 15mm; height: 15mm; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .meta { min-width: 0; }
  /* What the drawer holds, read from across the room — on a real cabinet front
     the range IS the label, and the drawer's own name is the fine print. */
  .holds { font-weight: 800; line-height: 1.05; word-break: break-word;
           letter-spacing: -.01em; }
  .place .holds { font-size: 20pt; }
  .place .holds + .name { font-size: 10pt; font-weight: 600; color: #475569; }
  .name { font-weight: 700; word-break: break-word; line-height: 1.15; }
  .place .name { font-size: 13pt; }
  .folder .name { font-size: 12pt; }
  .path { color: #64748b; font-size: 8pt; margin-top: 1mm; }
  .foot { margin-top: 1.5mm; display: flex; gap: 2mm; align-items: baseline;
          font-size: 8pt; }
  .party { color: #0f172a; font-weight: 600; }
  .count { color: #475569; }
  @media print { body { margin: 0; } h1, .hint { display: none; } }
</style></head>
<body>
  <h1>${esc(title)}</h1>
  <p class="hint">Cut along the dashed lines. Scanning a label opens this app
     filtered to that drawer or folder.</p>
  ${section("Places — for drawer fronts and cabinet doors", places, "places")}
  ${section("Folders — for the folder's front edge or tab", folders, "folders")}
</body></html>`;
}
