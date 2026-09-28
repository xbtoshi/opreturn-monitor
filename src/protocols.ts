/**
 * OP_RETURN protocol registry.
 *
 * Pure functions, no I/O. Turns raw OP_RETURN scriptPubKeys into structured
 * operations so the explorer can tell a $LEAF mint from a THORChain outbound
 * memo from a human message — before anything reaches the AI classifier.
 *
 * Detection is ordered from most to least specific; the first match wins.
 */

export interface DecodedOp {
  /** Output index inside the transaction (-1 when re-parsed from stored text). */
  vout: number;
  /** Protocol slug: runes | omni | ico-20 | crc-20 | thorchain | ... | text | binary */
  protocol: string;
  op: string | null;
  tick: string | null;
  amount: string | null;
  /** Human-readable rendering; null for opaque binary payloads. */
  text: string | null;
  /** Concatenated push data as hex, capped at PAYLOAD_HEX_MAX chars. */
  payload_hex: string;
}

export interface TxOutput {
  scriptpubkey: string | Uint8Array;
  scriptpubkey_type?: string;
  scriptpubkey_address?: string | null;
  value?: number;
}

export interface DecodedTx {
  ops: DecodedOp[];
  /** Primary protocol of the tx: first non-text/binary op, else text, else binary. */
  protocol: string;
  /** Text of every renderable op joined by newline (deduplicated), or null. */
  content: string | null;
  /** Address of the first non-OP_RETURN output, if it has one. */
  recipient: string | null;
  /** True when at least one OP_RETURN output is a Runes runestone. */
  has_runes: boolean;
}

export const PAYLOAD_HEX_MAX = 4000;

/** Protocols that never get a row of their own — they are counted per block instead. */
export const COUNT_ONLY_PROTOCOLS = new Set(['runes', 'binary', 'witness-commitment']);

export function isStorableProtocol(protocol: string): boolean {
  return !COUNT_ONLY_PROTOCOLS.has(protocol);
}

/** Protocols whose rows should go through the AI human-message classifier. */
export function isClassifiable(protocol: string | null): boolean {
  return protocol == null || protocol === 'text';
}

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 ? '0' + hex : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

function startsWith(bytes: Uint8Array, ascii: string): boolean {
  if (bytes.length < ascii.length) return false;
  for (let i = 0; i < ascii.length; i++) if (bytes[i] !== ascii.charCodeAt(i)) return false;
  return true;
}

function startsWithHex(bytes: Uint8Array, hex: string): boolean {
  return startsWith(bytes, String.fromCharCode(...hexToBytes(hex)));
}

const utf8 = new TextDecoder('utf-8');

export function isReadableText(s: string): boolean {
  if (s.trim().length === 0) return false;
  let printable = 0;
  let replacement = 0;
  for (const ch of s) {
    if (ch === '�') replacement++;
    else if (ch >= ' ' || ch === '\n' || ch === '\r' || ch === '\t') printable++;
    else return false; // a control byte means this is a binary layout, not prose
  }
  const n = Math.max(1, s.length);
  return replacement / n < 0.4 && printable / n >= 0.6;
}

// ---------------------------------------------------------------------------
// Script parsing
// ---------------------------------------------------------------------------

export interface ParsedScript {
  /** True when the script is OP_RETURN OP_13 ... (a Runes runestone). */
  runes: boolean;
  /** Data pushes in order (small-int opcodes are not data). */
  pushes: Uint8Array[];
}

/** Parse the pushes after OP_RETURN. Returns null if the script is not OP_RETURN. */
export function parseOpReturnScript(script: Uint8Array): ParsedScript | null {
  if (script.length < 1 || script[0] !== 0x6a) return null;
  const pushes: Uint8Array[] = [];
  let runes = false;
  let i = 1;
  if (script[i] === 0x5d) {
    runes = true;
    i++;
  }
  while (i < script.length) {
    const op = script[i];
    if (op === 0x00) {
      i += 1;
      pushes.push(new Uint8Array(0));
    } else if (op <= 0x4b) {
      pushes.push(script.subarray(i + 1, i + 1 + op));
      i += 1 + op;
    } else if (op === 0x4c) {
      if (i + 1 >= script.length) break;
      const len = script[i + 1];
      pushes.push(script.subarray(i + 2, i + 2 + len));
      i += 2 + len;
    } else if (op === 0x4d) {
      if (i + 2 >= script.length) break;
      const len = script[i + 1] | (script[i + 2] << 8);
      pushes.push(script.subarray(i + 3, i + 3 + len));
      i += 3 + len;
    } else if (op === 0x4e) {
      if (i + 4 >= script.length) break;
      const len = (script[i + 1] | (script[i + 2] << 8) | (script[i + 3] << 16) | (script[i + 4] << 24)) >>> 0;
      pushes.push(script.subarray(i + 5, i + 5 + len));
      i += 5 + len;
    } else if (op === 0x4f || (op >= 0x51 && op <= 0x60)) {
      // OP_1NEGATE / OP_1..OP_16: small integers, not data
      i += 1;
    } else {
      break; // any other opcode ends the data section
    }
  }
  return { runes, pushes };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

const RE_THOR_OUT = /^(OUT|REFUND):([0-9A-Fa-f]{64})$/;
const RE_THOR_MEMO = /^(=|SWAP|s|ADD|a|\+|WITHDRAW|wd|-|MIGRATE|NOOP|BOND|UNBOND|LEAVE|LOAN\+|LOAN-|\$\+|\$-|RAGNAROK|YGGDRASIL\+|YGGDRASIL-|RESERVE|DONATE|d|TRADE\+|TRADE-|SECURE\+|SECURE-|RUNEPOOL\+|RUNEPOOL-|CONSOLIDATE|SWITCH|LIMITO|LO):/i;
const RE_BRIDGE_MEMO = /^(?:([A-Za-z0-9]{2,8}):)?(to|from):([0-9][0-9.]*)?([A-Za-z][A-Za-z0-9()._-]*):(\S+)$/;
const RE_EVM_HASH = /^0x[0-9a-fA-F]{64}$/;
/** Inline data URI, e.g. data:image/png;base64,... (Core 30 lifted the 80-byte cap). */
const RE_DATA_URI = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(;[a-z0-9=.-]+)*(;base64)?,/i;
const RE_LIFI = /=\|lifi/;
const RE_SLUG = /[^a-z0-9._-]+/g;

/** Bare protocol markers that are ASCII but not messages. */
const MARKER_TAGS: Record<string, string> = {
  SATFLOW: 'satflow',
  BRC20PROG: 'brc20-prog',
  DIO1: 'dio',
  ALPN: 'alpn',
};


function slugProtocol(p: string): string {
  return p.toLowerCase().replace(RE_SLUG, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'unknown';
}

function strField(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v.slice(0, 64);
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

/** Try to interpret a decoded string as a structured protocol message. */
export function detectFromText(text: string): Omit<DecodedOp, 'vout' | 'payload_hex'> | null {
  const t = text.trim();
  if (!t) return null;

  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      const obj = JSON.parse(t) as unknown;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const rec = obj as Record<string, unknown>;
        if (typeof rec.p === 'string' && rec.p.length > 0) {
          return {
            protocol: slugProtocol(rec.p),
            op: strField(rec, 'op'),
            tick: strField(rec, 'tick', 'ticker', 'symbol', 'name'),
            amount: strField(rec, 'amt', 'amount', 'lim', 'max'),
            text: t,
          };
        }
      }
    } catch {
      // not JSON
    }
  }

  const thorOut = RE_THOR_OUT.exec(t);
  if (thorOut) {
    return { protocol: 'thorchain', op: thorOut[1].toUpperCase(), tick: null, amount: null, text: t };
  }
  if (RE_LIFI.test(t)) {
    return { protocol: 'lifi', op: 'bridge', tick: null, amount: null, text: t.replace(/[\u0000-\u001f�]+/g, ' ').trim() };
  }
  const thor = RE_THOR_MEMO.exec(t);
  if (thor) {
    const parts = t.split(':');
    return { protocol: 'thorchain', op: thor[1].toUpperCase(), tick: parts[1]?.slice(0, 64) || null, amount: null, text: t };
  }

  const bridge = RE_BRIDGE_MEMO.exec(t);
  if (bridge) {
    return {
      protocol: 'bridge-memo',
      op: bridge[2].toLowerCase(),
      tick: bridge[4].slice(0, 64),
      amount: bridge[3] ? bridge[3].replace(/\.$/, '') : null,
      text: t,
    };
  }

  if (RE_EVM_HASH.test(t)) {
    return { protocol: 'evm-hash', op: null, tick: null, amount: null, text: t };
  }

  const data = RE_DATA_URI.exec(t);
  if (data) {
    // The whole URI is kept as text so the UI can render images inline.
    return { protocol: 'data-uri', op: data[1].toLowerCase(), tick: null, amount: null, text: t };
  }

  // Bare marker followed by nothing, a control byte or non-ASCII data.
  for (const tag of Object.keys(MARKER_TAGS)) {
    if (t.startsWith(tag) && (t.length === tag.length || t.charCodeAt(tag.length) < 0x20 || t.charCodeAt(tag.length) >= 0x80)) {
      return { protocol: MARKER_TAGS[tag], op: null, tick: null, amount: null, text: tag };
    }
  }

  return null;
}

const STACKS_OPS: Record<string, string> = {
  '[': 'block-commit',
  '^': 'leader-key',
  p: 'pre-stx',
  x: 'stack-stx',
  '$': 'transfer-stx',
  '#': 'delegate-stx',
  '-': 'vote-for-aggregate-key',
};

function readU16(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}

function readU32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function readU64(b: Uint8Array, o: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(b[o + i]);
  return v;
}

function formatDivisible(v: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Omni Layer property ids we can name; 31 is Tether. Others are shown as omni#N. */
const OMNI_PROPERTIES: Record<number, { tick: string; divisible: boolean }> = {
  1: { tick: 'OMNI', divisible: true },
  2: { tick: 'TOMNI', divisible: true },
  3: { tick: 'MAID', divisible: false },
  31: { tick: 'USDT', divisible: true },
};

function detectOmni(p: Uint8Array): Omit<DecodedOp, 'vout' | 'payload_hex'> {
  // "omni" + version(2) + type(2) + ...
  if (p.length >= 8) {
    const type = readU16(p, 6);
    if (type === 0 && p.length >= 20) {
      const propertyId = readU32(p, 8);
      const raw = readU64(p, 12);
      const known = OMNI_PROPERTIES[propertyId];
      const tick = known ? known.tick : `omni#${propertyId}`;
      const amount = known?.divisible === false ? raw.toString() : formatDivisible(raw, 8);
      return { protocol: 'omni', op: 'simple-send', tick, amount, text: `Omni simple send · ${amount} ${tick}` };
    }
    return { protocol: 'omni', op: `type-${type}`, tick: null, amount: null, text: `Omni transaction type ${type}` };
  }
  return { protocol: 'omni', op: null, tick: null, amount: null, text: 'Omni transaction' };
}

/** Classify one OP_RETURN script into a structured op. */
export function decodeScript(script: Uint8Array | string, vout = -1): DecodedOp | null {
  const bytes = typeof script === 'string' ? hexToBytes(script) : script;
  const parsed = parseOpReturnScript(bytes);
  if (!parsed) return null;

  const payload = concat(parsed.pushes);
  const payload_hex = bytesToHex(payload).slice(0, PAYLOAD_HEX_MAX);
  const base = { vout, payload_hex };

  if (parsed.runes) return { ...base, protocol: 'runes', op: null, tick: null, amount: null, text: null };
  if (payload.length === 0) return { ...base, protocol: 'binary', op: null, tick: null, amount: null, text: null };

  if (payload.length === 36 && startsWithHex(payload, 'aa21a9ed')) {
    return { ...base, protocol: 'witness-commitment', op: null, tick: null, amount: null, text: null };
  }
  if (startsWith(payload, 'omni')) return { ...base, ...detectOmni(payload) };
  if (startsWith(payload, 'RSKBLOCK:')) {
    return { ...base, protocol: 'rootstock', op: 'merge-mining', tick: null, amount: null, text: 'Rootstock merge-mining tag' };
  }
  if (startsWith(payload, 'CORE') && payload.length >= 5 && payload[4] < 0x20) {
    return { ...base, protocol: 'core-dao', op: 'validator-tag', tick: null, amount: null, text: 'Core DAO delegation tag' };
  }
  if (startsWith(payload, 'EXSAT')) {
    return { ...base, protocol: 'exsat', op: null, tick: null, amount: null, text: 'exSat data tag' };
  }
  if (startsWith(payload, 'X2') && payload.length >= 3 && STACKS_OPS[String.fromCharCode(payload[2])]) {
    const op = STACKS_OPS[String.fromCharCode(payload[2])];
    return { ...base, protocol: 'stacks', op, tick: null, amount: null, text: `Stacks ${op}` };
  }
  if (startsWith(payload, 'sys') && payload.length >= 4 && payload[3] >= 0x80) {
    return { ...base, protocol: 'syscoin', op: 'merge-mining', tick: null, amount: null, text: 'Syscoin merge-mining tag' };
  }

  const text = utf8.decode(payload);
  const structured = detectFromText(text);
  if (structured) return { ...base, ...structured };

  if (isReadableText(text)) {
    return { ...base, protocol: 'text', op: null, tick: null, amount: null, text: text.trim() };
  }
  return { ...base, protocol: 'binary', op: null, tick: null, amount: null, text: null };
}

function primaryProtocol(ops: DecodedOp[]): string {
  for (const op of ops) if (op.protocol !== 'text' && op.protocol !== 'binary' && op.protocol !== 'runes') return op.protocol;
  if (ops.some((o) => o.protocol === 'text')) return 'text';
  if (ops.some((o) => o.protocol === 'runes')) return 'runes';
  return 'binary';
}

function joinTexts(ops: DecodedOp[]): string | null {
  const texts: string[] = [];
  for (const op of ops) if (op.text) texts.push(op.text);
  if (texts.length === 0) return null;
  return [...new Set(texts)].join('\n');
}

/** Decode every OP_RETURN output of a transaction. */
export function decodeTx(outputs: TxOutput[]): DecodedTx {
  const ops: DecodedOp[] = [];
  let recipient: string | null = null;
  for (let i = 0; i < outputs.length; i++) {
    const out = outputs[i];
    const script = typeof out.scriptpubkey === 'string' ? hexToBytes(out.scriptpubkey) : out.scriptpubkey;
    if (script.length > 0 && script[0] === 0x6a) {
      try {
        const op = decodeScript(script, i);
        if (op) ops.push(op);
      } catch {
        // malformed script: skip this output
      }
    } else if (recipient == null && out.scriptpubkey_address) {
      recipient = out.scriptpubkey_address;
    }
  }
  return {
    ops,
    protocol: ops.length ? primaryProtocol(ops) : 'binary',
    content: joinTexts(ops),
    recipient,
    has_runes: ops.some((o) => o.protocol === 'runes'),
  };
}

/**
 * Re-derive ops from text that was stored before the registry existed. Legacy
 * rows joined the decoded text of every OP_RETURN output with a newline, so a
 * $LEAF tx is two JSON lines; a PGP-armoured message is many lines that must
 * stay one op. Lines are split only when every line is itself structured.
 */
export function reparseContent(content: string): { ops: DecodedOp[]; protocol: string } {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const perLine = lines.length > 1 && lines.length <= 8 ? lines.map((l) => detectFromText(l)) : null;
  const ops: DecodedOp[] = [];
  if (perLine && perLine.every(Boolean)) {
    perLine.forEach((d, i) => ops.push({ vout: i, payload_hex: '', ...(d as NonNullable<typeof d>) }));
  } else {
    const d = detectFromText(content);
    if (d) ops.push({ vout: -1, payload_hex: '', ...d });
    else ops.push({ vout: -1, payload_hex: '', protocol: 'text', op: null, tick: null, amount: null, text: content.trim() });
  }
  return { ops, protocol: primaryProtocol(ops) };
}

/** Short, human-friendly label for a protocol slug. */
export function protocolLabel(protocol: string): string {
  switch (protocol) {
    case 'text':
      return 'Message';
    case 'binary':
      return 'Binary';
    case 'runes':
      return 'Runes';
    case 'omni':
      return 'Omni Layer';
    case 'thorchain':
      return 'THORChain';
    case 'bridge-memo':
      return 'Bridge memo';
    case 'evm-hash':
      return 'EVM hash';
    case 'witness-commitment':
      return 'Witness commitment';
    case 'rootstock':
      return 'Rootstock';
    case 'core-dao':
      return 'Core DAO';
    case 'exsat':
      return 'exSat';
    case 'stacks':
      return 'Stacks';
    case 'syscoin':
      return 'Syscoin';
    case 'lifi':
      return 'LI.FI';
    case 'data-uri':
      return 'Inline file';
    case 'nft':
      return 'NFT';
    default:
      return protocol.toUpperCase();
  }
}
