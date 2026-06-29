// Pure helpers for rendering/editing notes as bullet lists. No React — unit
// tested and shared by NoteText (display) and the note editors (the bullet
// insert button).

const BULLET_RE = /^[ \t]*[-*•][ \t]+(.*)$/;
// "1. ", "2) " … — a leading number followed by a dot or paren and a space.
const NUMBER_RE = /^[ \t]*(\d+)[.)][ \t]+(.*)$/;

export type NoteBlock =
  | { type: "text"; text: string }
  | { type: "list"; items: string[] }
  | { type: "ordered"; items: string[] };

/** Split a note into consecutive text / bullet-list / numbered-list blocks. */
export function toNoteBlocks(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let textLines: string[] = [];
  let items: string[] = [];
  let ordered: string[] = [];

  const flushText = () => {
    if (textLines.length) {
      blocks.push({ type: "text", text: textLines.join("\n") });
      textLines = [];
    }
  };
  const flushList = () => {
    if (items.length) {
      blocks.push({ type: "list", items });
      items = [];
    }
  };
  const flushOrdered = () => {
    if (ordered.length) {
      blocks.push({ type: "ordered", items: ordered });
      ordered = [];
    }
  };

  for (const line of text.split("\n")) {
    const bullet = line.match(BULLET_RE);
    const number = bullet ? null : line.match(NUMBER_RE);
    if (bullet) {
      flushText();
      flushOrdered();
      items.push(bullet[1]);
    } else if (number) {
      flushText();
      flushList();
      ordered.push(number[2]);
    } else {
      flushList();
      flushOrdered();
      textLines.push(line);
    }
  }
  flushText();
  flushList();
  flushOrdered();
  return blocks;
}

/** Does the note contain at least one bullet line? */
export function hasBullets(text: string): boolean {
  return text.split("\n").some((l) => BULLET_RE.test(l));
}

/** Does the note contain at least one numbered line? */
export function hasNumberedList(text: string): boolean {
  return text.split("\n").some((l) => NUMBER_RE.test(l));
}

/** Append a fresh bullet line to a note (for the "• List" editor button). */
export function appendBullet(text: string): string {
  if (!text) return "- ";
  return text.endsWith("\n") ? `${text}- ` : `${text}\n- `;
}

/**
 * Append the next numbered line to a note (for the "1. List" editor button).
 * The ordinal continues the trailing run of numbered lines (1, 2, 3 …).
 */
export function appendNumber(text: string): string {
  if (!text) return "1. ";
  const lines = text.split("\n");
  let last = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === "") continue;
    const m = lines[i].match(NUMBER_RE);
    if (m) last = parseInt(m[1], 10);
    break;
  }
  const next = `${last + 1}. `;
  return text.endsWith("\n") ? `${text}${next}` : `${text}\n${next}`;
}
