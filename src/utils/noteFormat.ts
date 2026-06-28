// Pure helpers for rendering/editing notes as bullet lists. No React — unit
// tested and shared by NoteText (display) and the note editors (the bullet
// insert button).

const BULLET_RE = /^[ \t]*[-*•][ \t]+(.*)$/;

export type NoteBlock =
  | { type: "text"; text: string }
  | { type: "list"; items: string[] };

/** Split a note into consecutive text / bullet-list blocks. */
export function toNoteBlocks(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let textLines: string[] = [];
  let items: string[] = [];

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

  for (const line of text.split("\n")) {
    const m = line.match(BULLET_RE);
    if (m) {
      flushText();
      items.push(m[1]);
    } else {
      flushList();
      textLines.push(line);
    }
  }
  flushText();
  flushList();
  return blocks;
}

/** Does the note contain at least one bullet line? */
export function hasBullets(text: string): boolean {
  return text.split("\n").some((l) => BULLET_RE.test(l));
}

/** Append a fresh bullet line to a note (for the "• List" editor button). */
export function appendBullet(text: string): string {
  if (!text) return "- ";
  return text.endsWith("\n") ? `${text}- ` : `${text}\n- `;
}
