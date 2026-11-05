// Firestore refuses a document over 1 MiB, and it refuses it on the SERVER: the
// write is accepted locally, then rejected with `invalid-argument`, which the
// offline queue treats as final (`isPermanentWriteError`), and the next snapshot
// puts the old copy back. The edit is gone and nothing said so. So a writer that
// can grow checks here first and refuses with a message instead.
//
// Sizes follow Firestore's "Storage size calculations": a string is its UTF-8
// bytes + 1 (field names and path segments too), a number or timestamp 8, a
// boolean or null 1, an array the sum of its elements, a document its name (the
// path's segments + 16) plus its fields plus 32. A nested map is counted the
// same way as a document, overhead included. The docs leave that overhead
// ambiguous and the emulator doesn't apply the document limit at all (it caps
// one field value instead), so this errs high: refusing a little early costs a
// message, guessing low costs the edit.

export const MAX_DOC_BYTES = 1_048_576;

/** Firebase uids are at most 128 characters; use this where the uid isn't known yet. */
export const ANY_UID = "u".repeat(128);

export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3; // BMP, or a lone surrogate (encoded as U+FFFD)
  }
  return n;
}

const stringSize = (s: string) => utf8Length(s) + 1;

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function mapSize(m: Record<string, unknown>): number {
  let n = 32;
  for (const [k, v] of Object.entries(m)) {
    if (v === undefined) continue; // never written
    n += stringSize(k) + valueSize(v);
  }
  return n;
}

export function valueSize(v: unknown): number {
  if (v === null) return 1;
  switch (typeof v) {
    case "string":
      return stringSize(v);
    case "number":
    case "bigint":
      return 8;
    case "boolean":
      return 1;
    case "undefined":
      return 0;
    case "object":
      break;
    default:
      return 8;
  }
  const o = v as object;
  if (Array.isArray(o)) return o.reduce((n: number, x) => n + valueSize(x), 0);
  if (o instanceof Uint8Array) return o.byteLength;
  if (o instanceof Date) return 8;
  if (isPlainObject(o)) return mapSize(o as Record<string, unknown>);
  const g = o as { latitude?: unknown; longitude?: unknown };
  if (typeof g.latitude === "number" && typeof g.longitude === "number") return 16;
  // A Timestamp, or a sentinel (serverTimestamp, increment) that becomes one or a number.
  return 8;
}

/** Bytes Firestore counts for `data` stored at `path` ("users", uid, collection, id, …). */
export function docBytes(path: readonly string[], data: Record<string, unknown>): number {
  const name = path.reduce((n, seg) => n + stringSize(seg), 16);
  return name + mapSize(data);
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

export class DocTooLargeError extends Error {
  readonly code = "doc-too-large";
  constructor(
    readonly bytes: number,
    message: string
  ) {
    super(message);
    this.name = "DocTooLargeError";
  }
}

/**
 * The refusal, worded for the person: what is too big, by how much, what to do.
 * `what` reads as a subject ("This item"), `fix` as a sentence.
 */
export function tooLargeMessage(bytes: number, what: string, fix: string): string {
  return `${what} is ${formatBytes(bytes)}, and one saved record holds up to 1 MB. ${fix}`;
}

/** Throws a DocTooLargeError (never sent, so never silently refused) when `data` won't fit. */
export function assertDocFits(
  path: readonly string[],
  data: Record<string, unknown>,
  what: string,
  fix: string
): void {
  const bytes = docBytes(path, data);
  if (bytes > MAX_DOC_BYTES) throw new DocTooLargeError(bytes, tooLargeMessage(bytes, what, fix));
}
