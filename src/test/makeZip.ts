// Test helper: build real ZIP bytes by hand (stored or deflated entries, optionally
// with ZIP64 records), so the reader is tested against the format, not against
// itself. Used by unit tests and by e2e; never imported by app code.

import { deflateRawSync } from "node:zlib";

export type ZipItem = { name: string; data: string; method?: 0 | 8 };

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

export function makeZip(items: ZipItem[], { zip64 = false }: { zip64?: boolean } = {}): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const it of items) {
    const raw = Buffer.from(it.data, "utf8");
    const method = it.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(it.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    // ZIP64: sizes and offset are 0xFFFFFFFF in the header and live in the extra field.
    const extra = Buffer.alloc(zip64 ? 4 + 24 : 0);
    if (zip64) {
      extra.writeUInt16LE(0x0001, 0);
      extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(raw.length), 4);
      extra.writeBigUInt64LE(BigInt(body.length), 12);
      extra.writeBigUInt64LE(BigInt(offset), 20);
    }
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt32LE(crc32(raw), 16);
    cd.writeUInt32LE(zip64 ? 0xffffffff : body.length, 20);
    cd.writeUInt32LE(zip64 ? 0xffffffff : raw.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(extra.length, 30);
    cd.writeUInt32LE(zip64 ? 0xffffffff : offset, 42);
    central.push(cd, name, extra);
    offset += 30 + name.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const cdOffset = offset;
  const tail: Buffer[] = [];
  if (zip64) {
    const z64 = Buffer.alloc(56);
    z64.writeUInt32LE(0x06064b50, 0);
    z64.writeBigUInt64LE(BigInt(44), 4);
    z64.writeBigUInt64LE(BigInt(items.length), 24);
    z64.writeBigUInt64LE(BigInt(items.length), 32);
    z64.writeBigUInt64LE(BigInt(cdBuf.length), 40);
    z64.writeBigUInt64LE(BigInt(cdOffset), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    loc.writeBigUInt64LE(BigInt(cdOffset + cdBuf.length), 8);
    loc.writeUInt32LE(1, 16);
    tail.push(z64, loc);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(zip64 ? 0xffff : items.length, 8);
  eocd.writeUInt16LE(zip64 ? 0xffff : items.length, 10);
  eocd.writeUInt32LE(zip64 ? 0xffffffff : cdBuf.length, 12);
  eocd.writeUInt32LE(zip64 ? 0xffffffff : cdOffset, 16);
  tail.push(eocd);
  return Buffer.concat([...locals, cdBuf, ...tail]);
}

