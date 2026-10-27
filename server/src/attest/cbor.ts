/**
 * Minimal CBOR decoder: enough for App Attest objects (maps, arrays, byte and
 * text strings, integers, simple values). Rejects anything else.
 */
export type Cbor = number | bigint | string | Buffer | boolean | null | undefined | Cbor[] | Map<Cbor, Cbor>;

export function decodeCbor(buf: Buffer): Cbor {
  let off = 0;
  const need = (n: number) => {
    if (off + n > buf.length) throw new Error('cbor: truncated');
  };
  const len = (info: number): number => {
    if (info < 24) return info;
    if (info === 24) { need(1); return buf[off++]!; }
    if (info === 25) { need(2); const v = buf.readUInt16BE(off); off += 2; return v; }
    if (info === 26) { need(4); const v = buf.readUInt32BE(off); off += 4; return v; }
    if (info === 27) {
      need(8);
      const v = buf.readBigUInt64BE(off);
      off += 8;
      if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('cbor: length too large');
      return Number(v);
    }
    throw new Error('cbor: indefinite lengths not supported');
  };
  const item = (depth: number): Cbor => {
    if (depth > 16) throw new Error('cbor: too deep');
    need(1);
    const b = buf[off++]!;
    const major = b >> 5;
    const info = b & 31;
    switch (major) {
      case 0: return len(info);
      case 1: return -1 - len(info);
      case 2: { const n = len(info); need(n); const v = Buffer.from(buf.subarray(off, off + n)); off += n; return v; }
      case 3: { const n = len(info); need(n); const v = buf.toString('utf8', off, off + n); off += n; return v; }
      case 4: { const n = len(info); const a: Cbor[] = []; for (let i = 0; i < n; i++) a.push(item(depth + 1)); return a; }
      case 5: { const n = len(info); const m = new Map<Cbor, Cbor>(); for (let i = 0; i < n; i++) { const k = item(depth + 1); m.set(k, item(depth + 1)); } return m; }
      case 7:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        if (info === 23) return undefined;
        throw new Error('cbor: unsupported simple value');
      default: throw new Error(`cbor: unsupported major type ${major}`);
    }
  };
  const v = item(0);
  if (off !== buf.length) throw new Error('cbor: trailing bytes');
  return v;
}

/** Test helper: the matching encoder. */
export function encodeCbor(v: Cbor): Buffer {
  const head = (major: number, n: number) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    if (n < 65536) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b; }
    const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b;
  };
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === 'string') { const s = Buffer.from(v, 'utf8'); return Buffer.concat([head(3, s.length), s]); }
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(encodeCbor)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [encodeCbor(k), encodeCbor(x)])]);
  if (v === true) return Buffer.from([0xf5]);
  if (v === false) return Buffer.from([0xf4]);
  if (v === null) return Buffer.from([0xf6]);
  throw new Error('cbor: cannot encode');
}
