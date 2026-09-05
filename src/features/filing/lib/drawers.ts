// What a drawer HOLDS, as opposed to what it is called.
//
// A real filing cabinet labels its drawer fronts "A-J", "K-P", "Q-Z", "Misc." —
// or "Customers", "Business", "Taxes", "2019". Those labels are not names, they
// are rules: they tell anyone holding a folder where it goes, without asking,
// and they make a folder in the wrong drawer visibly wrong. That is what makes a
// labelled cabinet self-filing, and it is the one thing the place tree could not
// express — it could say a drawer exists, never what belongs in it.
//
// The rule is PARSED from the label text, never stored beside it. The text is
// what gets printed on the physical sticker, so it has to survive verbatim; a
// structured copy alongside it would be a derived value in two places, which is
// exactly the drift CLAUDE.md warns about (cf. remindFrom / nextDueDefault).
//
// Pure — see drawers.test.ts.

import type { FilingFolder, FilingPlace } from "@/features/filing/lib/types";

export type DrawerRule =
  | { kind: "letters"; from: string; to: string } // A-J
  | { kind: "years"; from: number; to: number } // 2019, 2019-2021
  | { kind: "label"; value: string } // Taxes, Customers
  | { kind: "overflow" }; // Misc. — claims nothing, takes what nothing else claims

/** Everything a rule can be tested against. Loose so callers can pass a draft. */
export type FolderLike = Pick<FilingFolder, "name"> &
  Partial<Pick<FilingFolder, "category" | "tags" | "coversFrom" | "coversThrough">>;

export type Misfile = {
  folder: FilingFolder;
  /** The place it currently calls home — the one whose rule it fails. */
  placeId: string;
  /** A sibling of that place whose rule does claim it. */
  suggestedPlaceId: string;
};

/** The catch-all drawer, by any of the names people actually write on one. */
const OVERFLOW_WORDS = new Set([
  "misc",
  "misc.",
  "miscellaneous",
  "other",
  "others",
  "general",
  "everything else",
]);

/** Trim and collapse runs of whitespace, leaving the wording itself alone. */
function plain(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * The form the range tests read: every flavour of dash folded to "-", the word
 * "to" treated as one, and the padding around it dropped — so "a – j", "A to J"
 * and "A-J" are one rule. Only used for matching; display keeps the raw text.
 */
function compact(raw: string): string {
  return raw
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+to\s+/gi, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read a drawer's label as a rule. Blank or unrecognised text is `null`, which
 * simply means an ordinary drawer that claims nothing in particular.
 */
export function parseRule(contents: string | undefined | null): DrawerRule | null {
  if (!contents || !contents.trim()) return null;

  const text = plain(contents);
  if (OVERFLOW_WORDS.has(text.toLowerCase())) return { kind: "overflow" };

  const c = compact(contents);

  const years = /^(\d{4})(?:-(\d{4}))?$/.exec(c);
  if (years) {
    const a = Number(years[1]);
    const b = years[2] ? Number(years[2]) : a;
    return { kind: "years", from: Math.min(a, b), to: Math.max(a, b) };
  }

  // A bare "A" is a one-letter drawer; "J-A" is the same drawer as "A-J".
  const letters = /^([A-Za-z])(?:-([A-Za-z]))?$/.exec(c);
  if (letters) {
    const a = letters[1].toUpperCase();
    const b = (letters[2] ?? letters[1]).toUpperCase();
    return { kind: "letters", from: a <= b ? a : b, to: a <= b ? b : a };
  }

  return { kind: "label", value: text.toLowerCase() };
}

/**
 * The letter a folder files under — the first character of its name, accents
 * folded off. This is deliberately the same key the folder list sorts by, so a
 * drawer's range and the on-screen order can never disagree. A name starting
 * with a digit ("2024 Taxes") has no letter and belongs to no letter range.
 */
export function folderLetter(name: string): string | null {
  const first = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .charAt(0)
    .toUpperCase();
  return /^[A-Z]$/.test(first) ? first : null;
}

/**
 * The year a folder belongs to. `coversThrough` leads because the retention
 * clock already runs off it; a year written into the name is the last resort,
 * which is what makes "2024 Taxes" land in the 2024 drawer on its own.
 */
export function folderYear(folder: FolderLike): number | null {
  const fromDate = (d: string | undefined): number | null => {
    const m = d ? /^(\d{4})/.exec(d) : null;
    return m ? Number(m[1]) : null;
  };
  const dated = fromDate(folder.coversThrough) ?? fromDate(folder.coversFrom);
  if (dated !== null) return dated;
  const m = /\b(19\d{2}|20\d{2})\b/.exec(folder.name);
  return m ? Number(m[1]) : null;
}

/** Does this drawer claim this folder? An overflow drawer never claims. */
export function matchesRule(rule: DrawerRule, folder: FolderLike): boolean {
  if (rule.kind === "overflow") return false;
  if (rule.kind === "letters") {
    const letter = folderLetter(folder.name);
    return letter !== null && letter >= rule.from && letter <= rule.to;
  }
  if (rule.kind === "years") {
    const year = folderYear(folder);
    return year !== null && year >= rule.from && year <= rule.to;
  }
  const category = folder.category?.trim().toLowerCase();
  if (category && category === rule.value) return true;
  return (folder.tags ?? []).some((t) => t.trim().toLowerCase() === rule.value);
}

/**
 * "Drawer 4 · R-Z" — a place named alongside the rule that explains it. Uses the
 * label text as typed rather than the parsed rule, so what you read here is what
 * is written on the drawer and printed on its sticker.
 */
export function placeLabel(
  place: Pick<FilingPlace, "name" | "contents"> | undefined,
  fallback: string
): string {
  if (!place) return fallback;
  const rule = place.contents?.trim();
  return rule ? `${place.name} · ${rule}` : place.name;
}

/** How deep each place sits, so a drawer outranks the cabinet holding it. */
function depthById(places: FilingPlace[]): Record<string, number> {
  const byId = new Map(places.map((p) => [p.id, p]));
  const cache: Record<string, number> = {};
  const walk = (id: string, seen: Set<string>): number => {
    const known = cache[id];
    if (known !== undefined) return known;
    const place = byId.get(id);
    if (!place || seen.has(id)) return 0; // missing parent, or a cycle
    seen.add(id);
    const depth = place.parentId ? walk(place.parentId, seen) + 1 : 0;
    cache[id] = depth;
    return depth;
  };
  for (const p of places) walk(p.id, new Set());
  return cache;
}

/**
 * Where this folder should go, best first — every place whose rule claims it,
 * deepest first so a drawer beats the cabinet around it. When nothing claims it,
 * the overflow drawers, which is what "Misc." is for. When there are none of
 * those either, nothing: an honest empty answer beats a confident wrong one.
 */
export function suggestPlaces(places: FilingPlace[], folder: FolderLike): string[] {
  const depth = depthById(places);
  const claimed: FilingPlace[] = [];
  const overflow: FilingPlace[] = [];

  for (const place of places) {
    const rule = parseRule(place.contents);
    if (!rule) continue;
    if (rule.kind === "overflow") overflow.push(place);
    else if (matchesRule(rule, folder)) claimed.push(place);
  }

  return (claimed.length ? claimed : overflow)
    .sort(
      (a, b) =>
        (depth[b.id] ?? 0) - (depth[a.id] ?? 0) ||
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        a.name.localeCompare(b.name)
    )
    .map((p) => p.id);
}

/**
 * Folders sitting in a drawer that does not claim them — but only when a SIBLING
 * drawer does. That condition is the whole point: without it this nags about
 * every folder whose drawer happens to carry a rule, including the ones with no
 * better home anywhere. With it, the only thing it ever says is "this belongs in
 * the next drawer along", which is a thing you can act on in one reach.
 *
 * Judged on `homePlaceId` — where the folder BELONGS. A folder checked out to
 * your desk is out, not misfiled, and its home drawer is still the question.
 */
export function misfiledFolders(
  places: FilingPlace[],
  folders: FilingFolder[]
): Misfile[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  const out: Misfile[] = [];

  for (const folder of folders) {
    if (folder.archived) continue;
    const home = folder.homePlaceId ? byId.get(folder.homePlaceId) : undefined;
    if (!home) continue;

    const rule = parseRule(home.contents);
    // No rule claims nothing; an overflow drawer accepts anything by design.
    if (!rule || rule.kind === "overflow") continue;
    if (matchesRule(rule, folder)) continue;

    const claimer = places.find((p) => {
      if (p.id === home.id || p.parentId !== home.parentId) return false;
      const r = parseRule(p.contents);
      return r !== null && r.kind !== "overflow" && matchesRule(r, folder);
    });
    if (claimer) {
      out.push({ folder, placeId: home.id, suggestedPlaceId: claimer.id });
    }
  }

  return out;
}

/**
 * Roughly how much of a filing drawer each initial earns. Splitting A-Z into
 * equal *letter* counts gives one drawer that jams and one holding Q, X and Z —
 * which is precisely why real cabinets are labelled unevenly (A-J, K-P, Q-Z:
 * ten letters, six, ten). Approximate by design; the point is the shape, and
 * any drawer's label can be retyped afterwards.
 */
const INITIAL_WEIGHT: Record<string, number> = {
  A: 8, B: 9, C: 10, D: 7, E: 4, F: 5, G: 6, H: 7, I: 2, J: 3, K: 4, L: 6, M: 10,
  N: 3, O: 2, P: 8, Q: 1, R: 7, S: 12, T: 6, U: 1, V: 2, W: 6, X: 1, Y: 1, Z: 1,
};

const ALPHABET = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

/** "A-D" for a span, "Q" for a drawer holding one letter. */
function spanLabel(start: number, end: number): string {
  return start === end ? ALPHABET[start] : `${ALPHABET[start]}-${ALPHABET[end]}`;
}

/**
 * Split A-Z across `count` drawers so each holds about the same amount of paper.
 * Every letter lands in exactly one drawer and the ranges run in order, so the
 * result reads down a cabinet front the way the labels in it do.
 */
export function alphabetSplit(count: number): string[] {
  const n = Math.max(1, Math.min(ALPHABET.length, Math.floor(count)));
  const total = ALPHABET.reduce((sum, l) => sum + INITIAL_WEIGHT[l], 0);
  const out: string[] = [];
  let start = 0;
  let used = 0; // weight already inside completed ranges

  for (let k = 0; k < n; k++) {
    const remaining = n - k; // ranges still to place, this one included
    if (remaining === 1) {
      out.push(spanLabel(start, ALPHABET.length - 1));
      break;
    }
    const target = used + (total - used) / remaining;
    let end = start;
    let acc = used + INITIAL_WEIGHT[ALPHABET[start]];
    // Grow while the next letter lands closer to an even share, and while there
    // are still enough letters left over for the drawers below this one.
    while (end + 1 <= ALPHABET.length - remaining) {
      const next = acc + INITIAL_WEIGHT[ALPHABET[end + 1]];
      if (Math.abs(next - target) >= Math.abs(acc - target)) break;
      acc = next;
      end += 1;
    }
    out.push(spanLabel(start, end));
    used = acc;
    start = end + 1;
  }

  return out;
}
