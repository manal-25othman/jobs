/**
 * Phase B, package 3 — a minimal, deterministic ZIP writer for activity materials (no dependency).
 *
 * "Stored" entries (no compression): starter projects are a few kilobytes of text. Entries are sorted and carry a
 * fixed timestamp, so the same folder always produces byte-identical archives — the archive checksum is a stable
 * fingerprint of the material version. Names are UTF-8 (general-purpose flag bit 11), so Arabic file names work.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry { readonly path: string; readonly bytes: Uint8Array }

/** 1980-01-01 00:00 in MS-DOS format: the earliest representable date, fixed for determinism. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of sorted) {
    if (!e.path || e.path.startsWith('/') || e.path.includes('..') || e.path.includes('\\')) throw new Error(`unsafe archive path: ${e.path}`);
    const name = enc.encode(e.path);
    const crc = crc32(e.bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, DOS_TIME, true); local.setUint16(12, DOS_DATE, true); local.setUint32(14, crc, true);
    local.setUint32(18, e.bytes.byteLength, true); local.setUint32(22, e.bytes.byteLength, true); local.setUint16(26, name.byteLength, true); local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, e.bytes);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, DOS_TIME, true); cen.setUint16(14, DOS_DATE, true); cen.setUint32(16, crc, true);
    cen.setUint32(20, e.bytes.byteLength, true); cen.setUint32(24, e.bytes.byteLength, true); cen.setUint16(28, name.byteLength, true);
    cen.setUint16(30, 0, true); cen.setUint16(32, 0, true); cen.setUint16(34, 0, true); cen.setUint16(36, 0, true); cen.setUint32(38, 0, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.byteLength + e.bytes.byteLength;
  }
  const centralSize = central.reduce((s, c) => s + c.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, sorted.length, true); end.setUint16(10, sorted.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.byteLength, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.byteLength; }
  return out;
}

/** Reads back a stored-entry archive written by createZip (used by tests and by the validation of a loaded material). */
export function readZip(zip: Uint8Array): ZipEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  let p = 0;
  while (p + 4 <= zip.byteLength && view.getUint32(p, true) === 0x04034b50) {
    const size = view.getUint32(p + 18, true); const nameLen = view.getUint16(p + 26, true); const extra = view.getUint16(p + 28, true);
    const name = dec.decode(zip.subarray(p + 30, p + 30 + nameLen));
    const start = p + 30 + nameLen + extra;
    const bytes = zip.slice(start, start + size);
    if (crc32(bytes) !== view.getUint32(p + 14, true)) throw new Error(`corrupt archive entry: ${name}`);
    out.push({ path: name, bytes });
    p = start + size;
  }
  return out;
}
