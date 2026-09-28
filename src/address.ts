/**
 * Script → address for the standard output types, plus a synchronous
 * SHA-256 so block parsing never has to await per output. No dependencies.
 */

// ---------------------------------------------------------------------------
// SHA-256 (sync)
// ---------------------------------------------------------------------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

export function sha256(data: Uint8Array): Uint8Array {
  const len = data.length;
  const bitLen = len * 8;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(padded.length - 4, bitLen >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]);
  return out;
}

export function sha256d(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

// ---------------------------------------------------------------------------
// Base58Check
// ---------------------------------------------------------------------------

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58check(payload: Uint8Array): string {
  const checksum = sha256d(payload).subarray(0, 4);
  const bytes = new Uint8Array(payload.length + 4);
  bytes.set(payload);
  bytes.set(checksum, payload.length);

  const digits: number[] = [0];
  for (const b of bytes) {
    let carry = b;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let s = '';
  for (const b of bytes) {
    if (b !== 0) break;
    s += '1';
  }
  for (let i = digits.length - 1; i >= 0; i--) s += B58[digits[i]];
  return s;
}

// ---------------------------------------------------------------------------
// Bech32 / Bech32m
// ---------------------------------------------------------------------------

const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function toWords(bytes: Uint8Array): number[] {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >>> bits) & 31);
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

export function segwitAddress(hrp: string, version: number, program: Uint8Array): string {
  const words = [version, ...toWords(program)];
  const constant = version === 0 ? 1 : 0x2bc830a3;
  const values = [...hrpExpand(hrp), ...words];
  const mod = polymod([...values, 0, 0, 0, 0, 0, 0]) ^ constant;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >>> (5 * (5 - i))) & 31);
  let s = hrp + '1';
  for (const w of [...words, ...checksum]) s += B32[w];
  return s;
}

// ---------------------------------------------------------------------------
// scriptPubKey → address
// ---------------------------------------------------------------------------

export type ScriptType = 'p2pkh' | 'p2sh' | 'v0_p2wpkh' | 'v0_p2wsh' | 'v1_p2tr' | 'op_return' | 'p2pk' | 'unknown';

export function scriptType(s: Uint8Array): ScriptType {
  const n = s.length;
  if (n === 25 && s[0] === 0x76 && s[1] === 0xa9 && s[2] === 0x14 && s[23] === 0x88 && s[24] === 0xac) return 'p2pkh';
  if (n === 23 && s[0] === 0xa9 && s[1] === 0x14 && s[22] === 0x87) return 'p2sh';
  if (n === 22 && s[0] === 0x00 && s[1] === 0x14) return 'v0_p2wpkh';
  if (n === 34 && s[0] === 0x00 && s[1] === 0x20) return 'v0_p2wsh';
  if (n === 34 && s[0] === 0x51 && s[1] === 0x20) return 'v1_p2tr';
  if (n > 0 && s[0] === 0x6a) return 'op_return';
  if ((n === 35 && s[0] === 0x21 && s[34] === 0xac) || (n === 67 && s[0] === 0x41 && s[66] === 0xac)) return 'p2pk';
  return 'unknown';
}

/** Mainnet address for a standard scriptPubKey, or null (OP_RETURN, bare multisig, anchors...). */
export function scriptToAddress(s: Uint8Array): string | null {
  switch (scriptType(s)) {
    case 'p2pkh': {
      const p = new Uint8Array(21);
      p[0] = 0x00;
      p.set(s.subarray(3, 23), 1);
      return base58check(p);
    }
    case 'p2sh': {
      const p = new Uint8Array(21);
      p[0] = 0x05;
      p.set(s.subarray(2, 22), 1);
      return base58check(p);
    }
    case 'v0_p2wpkh':
      return segwitAddress('bc', 0, s.subarray(2, 22));
    case 'v0_p2wsh':
      return segwitAddress('bc', 0, s.subarray(2, 34));
    case 'v1_p2tr':
      return segwitAddress('bc', 1, s.subarray(2, 34));
    default:
      return null;
  }
}
