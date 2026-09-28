/**
 * Raw Bitcoin block parser. Linear over the bytes, allocation-light: outputs
 * are views into the block buffer and the txid is computed only when asked
 * for (double SHA-256 over the non-witness serialization).
 */
import { sha256d } from './address';

export interface ParsedOutput {
  value: number;
  script: Uint8Array;
}

export interface ParsedTx {
  index: number;
  outputs: ParsedOutput[];
  /** True when at least one output script starts with OP_RETURN. */
  hasOpReturn: boolean;
  /** Byte ranges of the non-witness serialization: [version][inputs+outputs][locktime]. */
  ranges: Array<[number, number]>;
}

export interface ParsedBlock {
  txCount: number;
  txs: ParsedTx[];
}

class Reader {
  pos = 0;
  constructor(readonly buf: Uint8Array) {}
  u8(): number {
    return this.buf[this.pos++];
  }
  u32(): number {
    const v = this.buf[this.pos] | (this.buf[this.pos + 1] << 8) | (this.buf[this.pos + 2] << 16) | (this.buf[this.pos + 3] << 24);
    this.pos += 4;
    return v >>> 0;
  }
  u64(): number {
    const lo = this.u32();
    const hi = this.u32();
    return hi * 0x100000000 + lo;
  }
  varint(): number {
    const b = this.u8();
    if (b < 0xfd) return b;
    if (b === 0xfd) {
      const v = this.buf[this.pos] | (this.buf[this.pos + 1] << 8);
      this.pos += 2;
      return v;
    }
    if (b === 0xfe) return this.u32();
    return this.u64();
  }
  skip(n: number): void {
    this.pos += n;
  }
  slice(n: number): Uint8Array {
    const s = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
}

/**
 * Parse a full block. `onlyOpReturn` keeps just the txs that carry an
 * OP_RETURN output (the rest are counted, not returned).
 */
export function parseRawBlock(buf: Uint8Array, onlyOpReturn = true): ParsedBlock {
  const r = new Reader(buf);
  r.skip(80); // header
  const txCount = r.varint();
  const txs: ParsedTx[] = [];

  for (let t = 0; t < txCount; t++) {
    const start = r.pos;
    r.skip(4); // version
    let segwit = false;
    if (buf[r.pos] === 0x00 && buf[r.pos + 1] === 0x01) {
      segwit = true;
      r.skip(2);
    }
    const bodyStart = r.pos;
    const nIn = r.varint();
    for (let i = 0; i < nIn; i++) {
      r.skip(36); // outpoint
      r.skip(r.varint()); // scriptSig
      r.skip(4); // sequence
    }
    const nOut = r.varint();
    const outputs: ParsedOutput[] = [];
    let hasOpReturn = false;
    for (let o = 0; o < nOut; o++) {
      const value = r.u64();
      const script = r.slice(r.varint());
      if (script.length > 0 && script[0] === 0x6a) hasOpReturn = true;
      outputs.push({ value, script });
    }
    const bodyEnd = r.pos;
    if (segwit) {
      for (let i = 0; i < nIn; i++) {
        const items = r.varint();
        for (let k = 0; k < items; k++) r.skip(r.varint());
      }
    }
    const lockStart = r.pos;
    r.skip(4);
    if (r.pos > buf.length) throw new Error(`truncated block at tx ${t}`);

    if (hasOpReturn || !onlyOpReturn) {
      txs.push({
        index: t,
        outputs,
        hasOpReturn,
        ranges: [
          [start, start + 4],
          [bodyStart, bodyEnd],
          [lockStart, lockStart + 4],
        ],
      });
    }
  }
  if (r.pos !== buf.length) throw new Error(`block has ${buf.length - r.pos} trailing bytes`);
  return { txCount, txs };
}

/** Hex txid (display byte order) of a parsed tx. */
export function txidOf(buf: Uint8Array, tx: ParsedTx): string {
  let n = 0;
  for (const [a, b] of tx.ranges) n += b - a;
  const ser = new Uint8Array(n);
  let o = 0;
  for (const [a, b] of tx.ranges) {
    ser.set(buf.subarray(a, b), o);
    o += b - a;
  }
  const h = sha256d(ser);
  let hex = '';
  for (let i = 31; i >= 0; i--) hex += h[i].toString(16).padStart(2, '0');
  return hex;
}

/** Block hash (display byte order) from the 80-byte header. */
export function blockHashOf(buf: Uint8Array): string {
  const h = sha256d(buf.subarray(0, 80));
  let hex = '';
  for (let i = 31; i >= 0; i--) hex += h[i].toString(16).padStart(2, '0');
  return hex;
}
