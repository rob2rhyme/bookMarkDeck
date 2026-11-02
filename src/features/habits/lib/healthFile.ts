// Reading a health export from a File the user picked, entirely in the browser:
// an Apple Health `export.zip`/`export.xml`, or a Google Fit / generic CSV. The
// file is streamed (an Apple export is often several gigabytes of XML) and never
// uploaded. The parsing rules live in healthImport.ts; this is only the file layer.
//
// `export.zip` is opened with a small ZIP reader of our own rather than a
// dependency: it finds the entry in the central directory and inflates just that
// one with the browser's DecompressionStream. ZIP64 sizes are handled, since a
// big export.xml needs them.

import {
  AppleHealthReader,
  mergeDaily,
  parseHealthCsv,
  type DailyHealth,
} from "@/features/habits/lib/healthImport";

export class HealthImportError extends Error {}

/** A CSV bigger than this is not a daily summary; don't read it into memory. */
const MAX_CSV_BYTES = 64 * 1024 * 1024;

export type ZipEntry = {
  name: string;
  method: number; // 0 stored, 8 deflate
  compressedSize: number;
  size: number;
  dataStart: number;
};

const SIG_EOCD = 0x06054b50;
const SIG_CD = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const SIG_ZIP64_LOC = 0x07064b50;

const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const u16 = (v: DataView, o: number) => v.getUint16(o, true);
// ZIP64 numbers are 64-bit; anything past 2^53 is not a file this app will read.
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));

async function bytes(blob: Blob, start: number, end: number): Promise<DataView> {
  const buf = await blob.slice(start, end).arrayBuffer();
  return new DataView(buf);
}

/** Every entry in a ZIP's central directory. Throws HealthImportError if it isn't a ZIP. */
export async function listZip(file: Blob): Promise<ZipEntry[]> {
  const tailLen = Math.min(file.size, 65557);
  const tail = await bytes(file, file.size - tailLen, file.size);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (u32(tail, i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new HealthImportError("That doesn’t look like a ZIP file.");

  let entryCount = u16(tail, eocd + 10);
  let cdSize = u32(tail, eocd + 12);
  let cdOffset = u32(tail, eocd + 16);

  if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    // ZIP64: the real values sit in a record the locator points to.
    const locAt = eocd - 20;
    if (locAt < 0 || u32(tail, locAt) !== SIG_ZIP64_LOC) {
      throw new HealthImportError("That ZIP’s directory is damaged.");
    }
    const z64At = u64(tail, locAt + 8);
    const z = await bytes(file, z64At, z64At + 56);
    entryCount = u64(z, 32);
    cdSize = u64(z, 40);
    cdOffset = u64(z, 48);
  }

  const cd = await bytes(file, cdOffset, cdOffset + cdSize);
  const decoder = new TextDecoder();
  const out: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < entryCount && p + 46 <= cd.byteLength; n++) {
    if (u32(cd, p) !== SIG_CD) throw new HealthImportError("That ZIP’s directory is damaged.");
    const method = u16(cd, p + 10);
    let compressedSize = u32(cd, p + 20);
    let size = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    let localOffset = u32(cd, p + 42);
    const name = decoder.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));

    // The ZIP64 extra field carries whichever of these three didn't fit, in order.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = u16(cd, e);
      const len = u16(cd, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) {
          size = u64(cd, q);
          q += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = u64(cd, q);
          q += 8;
        }
        if (localOffset === 0xffffffff) localOffset = u64(cd, q);
      }
      e += 4 + len;
    }

    out.push({ name, method, compressedSize, size, dataStart: localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  // dataStart so far holds the LOCAL HEADER offset; the data follows the header,
  // whose own name/extra lengths can differ from the directory's.
  for (const entry of out) {
    const h = await bytes(file, entry.dataStart, entry.dataStart + 30);
    if (u32(h, 0) !== SIG_LOCAL) throw new HealthImportError("That ZIP’s directory is damaged.");
    entry.dataStart += 30 + u16(h, 26) + u16(h, 28);
  }
  return out;
}

/** An entry's bytes as a text stream (inflated if it was deflated). */
export function zipEntryText(file: Blob, entry: ZipEntry): ReadableStream<string> {
  const raw = file.slice(entry.dataStart, entry.dataStart + entry.compressedSize).stream();
  if (entry.method === 0) return raw.pipeThrough(new TextDecoderStream("utf-8"));
  if (entry.method === 8) {
    return raw
      .pipeThrough(new DecompressionStream("deflate-raw"))
      .pipeThrough(new TextDecoderStream("utf-8"));
  }
  throw new HealthImportError("That ZIP uses a compression method this app can’t read.");
}

async function readAll(stream: ReadableStream<string>, onChunk: (s: string) => void) {
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    onChunk(value);
  }
}

async function streamApple(
  stream: ReadableStream<string>,
  totalChars: number,
  onProgress?: (fraction: number) => void
): Promise<DailyHealth> {
  const reader = new AppleHealthReader();
  let seen = 0;
  await readAll(stream, (chunk) => {
    reader.push(chunk);
    seen += chunk.length;
    if (totalChars > 0) onProgress?.(Math.min(0.99, seen / totalChars));
  });
  return reader.result();
}

const isAppleXml = (name: string) => /(^|\/)export\.xml$/i.test(name);

/**
 * A picked file → the days it covers. Accepts an Apple Health export.zip or its
 * export.xml, a Google Takeout .zip (its Fit CSVs) or a CSV. Throws a
 * HealthImportError with a message fit to show.
 */
export async function readHealthFile(
  file: File,
  onProgress?: (fraction: number) => void
): Promise<DailyHealth> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".zip")) {
    const entries = await listZip(file);
    const xml = entries.find((e) => isAppleXml(e.name));
    if (xml) return streamApple(zipEntryText(file, xml), xml.size, onProgress);

    // Not Apple: a Takeout's Fit folder is many small CSVs.
    const csvs = entries.filter((e) => /\.csv$/i.test(e.name) && e.size <= MAX_CSV_BYTES);
    const parts: DailyHealth[] = [];
    for (const [i, entry] of csvs.entries()) {
      let text = "";
      await readAll(zipEntryText(file, entry), (c) => (text += c));
      const parsed = parseHealthCsv(text);
      if (parsed) parts.push(parsed);
      onProgress?.((i + 1) / csvs.length);
    }
    if (parts.length === 0) {
      throw new HealthImportError(
        "Couldn’t find an Apple Health export.xml or any step/exercise data in that ZIP."
      );
    }
    return mergeDaily(parts);
  }

  if (name.endsWith(".xml")) {
    return streamApple(file.stream().pipeThrough(new TextDecoderStream("utf-8")), file.size, onProgress);
  }

  if (file.size > MAX_CSV_BYTES) throw new HealthImportError("That file is too big to be a daily summary.");
  const parsed = parseHealthCsv(await file.text());
  if (!parsed) {
    throw new HealthImportError(
      "Couldn’t find a date column and a steps, exercise, sleep or mindful column in that file."
    );
  }
  return parsed;
}

/** Several picked files → one set of days (the larger value wins where they overlap). */
export async function readHealthFiles(
  files: File[],
  onProgress?: (fraction: number) => void
): Promise<DailyHealth> {
  const parts: DailyHealth[] = [];
  for (const [i, f] of files.entries()) {
    parts.push(await readHealthFile(f, (p) => onProgress?.((i + p) / files.length)));
  }
  onProgress?.(1);
  return mergeDaily(parts);
}
