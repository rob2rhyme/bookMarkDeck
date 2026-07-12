// Pure helpers for rendering/editing notes as bullet lists. No React — unit
// tested and shared by NoteText (display) and the note editors (the bullet
// insert button).

const BULLET_RE = /^[ \t]*[-*•][ \t]+(.*)$/;
// "1. ", "2) " … — a leading number followed by a dot or paren and a space.
const NUMBER_RE = /^[ \t]*(\d+)[.)][ \t]+(.*)$/;
// Capture the indent + marker so Enter can continue the same style.
const BULLET_PARTS_RE = /^([ \t]*)([-*•])[ \t]+(.*)$/;
const NUMBER_PARTS_RE = /^([ \t]*)(\d+)([.)])[ \t]+(.*)$/;
// A "[x] " (checked) or "[ ] " (unchecked) marker at the start of an item.
const CHECKED_RE = /^\[[xX]\][ \t]+/;
const UNCHECKED_RE = /^\[ \][ \t]+/;

/** Item content with any leading checked/unchecked marker removed. */
function stripMarker(content: string): string {
  return content.replace(CHECKED_RE, "").replace(UNCHECKED_RE, "");
}

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

/**
 * Continue a list when Enter is pressed inside a note ("list mode"): pressing
 * Enter on a bullet/numbered line starts the next item automatically; pressing
 * Enter on an *empty* item ends the list (the empty prefix is removed).
 * Returns the new text + caret position, or null when the caret isn't on a
 * list line (caller falls through to the default newline).
 */
export function continueListOnEnter(
  text: string,
  caret: number
): { text: string; caret: number } | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const nl = text.indexOf("\n", caret);
  const lineEnd = nl === -1 ? text.length : nl;
  const line = text.slice(lineStart, lineEnd);

  const bullet = line.match(BULLET_PARTS_RE);
  const number = bullet ? null : line.match(NUMBER_PARTS_RE);
  if (!bullet && !number) return null;

  // Caret inside the indent/marker itself → default newline (pushes the whole
  // item down instead of mangling it into "- - a").
  const contentStart = line.length - (bullet ? bullet[3] : number![4]).length;
  if (caret < lineStart + contentStart) return null;

  const content = stripMarker(bullet ? bullet[3] : number![4]);
  if (content.trim() === "") {
    // Empty item → end list mode: drop the prefix-only line.
    return { text: text.slice(0, lineStart) + text.slice(lineEnd), caret: lineStart };
  }

  const prefix = bullet
    ? `${bullet[1]}${bullet[2]} `
    : `${number![1]}${parseInt(number![2], 10) + 1}${number![3]} `;
  return {
    text: `${text.slice(0, caret)}\n${prefix}${text.slice(caret)}`,
    caret: caret + 1 + prefix.length,
  };
}

/* ------------------------------------------------------------- checklists ---
 * List lines in a to-do note double as a mini checklist. Checked state is kept
 * in the note text itself ("- [x] item"), so the string schema (localStorage +
 * Firestore) is unchanged and plain bullets remain valid unchecked items.
 */

export type ChecklistItem = {
  text: string; // display text, marker stripped
  checked: boolean;
  line: number; // line index in the note, for toggling
};

export type ChecklistBlock =
  | { type: "text"; text: string }
  | { type: "items"; items: ChecklistItem[] };

function itemAt(line: string, index: number): ChecklistItem | null {
  const m = line.match(BULLET_RE) ?? line.match(NUMBER_RE);
  if (!m) return null;
  const raw = m[m.length - 1];
  const text = stripMarker(raw);
  // A prefix-only line ("- ") isn't an item — no phantom checkbox, and it
  // can't hold a to-do hostage in the all-checked auto-complete.
  if (text.trim() === "") return null;
  return { text, checked: CHECKED_RE.test(raw), line: index };
}

/** Split a note into text blocks and runs of checklist items (all list lines). */
export function toChecklistBlocks(text: string): ChecklistBlock[] {
  const blocks: ChecklistBlock[] = [];
  let textLines: string[] = [];
  let items: ChecklistItem[] = [];

  const flushText = () => {
    if (textLines.length) {
      blocks.push({ type: "text", text: textLines.join("\n") });
      textLines = [];
    }
  };
  const flushItems = () => {
    if (items.length) {
      blocks.push({ type: "items", items });
      items = [];
    }
  };

  text.split("\n").forEach((line, i) => {
    const item = itemAt(line, i);
    if (item) {
      flushText();
      items.push(item);
    } else {
      flushItems();
      textLines.push(line);
    }
  });
  flushText();
  flushItems();
  return blocks;
}

/** Every checklist item in the note, in order. */
export function noteChecklistItems(text: string): ChecklistItem[] {
  return toChecklistBlocks(text).flatMap((b) =>
    b.type === "items" ? b.items : []
  );
}

/** Rewrite one list line's checked marker, leaving the rest of the note as-is. */
export function setNoteItemChecked(
  text: string,
  line: number,
  checked: boolean
): string {
  const lines = text.split("\n");
  const target = lines[line];
  if (target === undefined) return text;
  const bullet = target.match(BULLET_PARTS_RE);
  const number = bullet ? null : target.match(NUMBER_PARTS_RE);
  if (!bullet && !number) return text;
  const prefix = bullet
    ? `${bullet[1]}${bullet[2]} `
    : `${number![1]}${number![2]}${number![3]} `;
  const bare = stripMarker(bullet ? bullet[3] : number![4]);
  lines[line] = `${prefix}${checked ? "[x] " : ""}${bare}`;
  return lines.join("\n");
}
