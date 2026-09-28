#!/usr/bin/env node
/**
 * Seed the LOCAL D1 database with synthetic explorer rows so feed / protocol /
 * chat queries can be timed at production-like volume (default 400k rows).
 *
 *   node scripts/loadtest-seed.mjs [rows] [outDir]
 *
 * Writes chunked SQL files, then applies each with
 * `wrangler d1 execute opreturn-monitor --local --file`. Rows are tagged with
 * txids starting "lt" + address "loadtest" so they can be removed again:
 *   wrangler d1 execute opreturn-monitor --local --command "DELETE FROM ops WHERE txid LIKE 'lt%'; DELETE FROM messages WHERE txid LIKE 'lt%'"
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const total = Number(process.argv[2]) || 400000;
const outDir = process.argv[3] || join(process.cwd(), '.loadtest');
mkdirSync(outDir, { recursive: true });

const PROTOS = [
  ['text', 0.12],
  ['thorchain', 0.3],
  ['evm-hash', 0.2],
  ['bridge-memo', 0.15],
  ['crc-20', 0.08],
  ['ico-20', 0.05],
  ['omni', 0.04],
  ['stacks', 0.03],
  ['rootstock', 0.02],
  ['lifi', 0.01],
];
const TICKS = ['LEAF', 'BONS', 'SATS', 'ORDI', 'PIZZA', 'MEME', 'USDT(TRON)', 'SOL'];
const ADDRS = [];
for (let i = 0; i < 5000; i++) ADDRS.push('bc1qload' + i.toString(36).padStart(8, 'x'));
ADDRS.push('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'); // a monitored one

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const proto = () => {
  let r = rnd();
  for (const [p, w] of PROTOS) {
    if ((r -= w) <= 0) return p;
  }
  return 'text';
};
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const now = Math.floor(Date.now() / 1000);
const span = 30 * 86400;
const ROWS_PER_STMT = 100;
const STMTS_PER_FILE = 100;
let file = 0;
let written = 0;
const files = [];

while (written < total) {
  let sql = 'PRAGMA foreign_keys=OFF;\n';
  for (let s = 0; s < STMTS_PER_FILE && written < total; s++) {
    const msgs = [];
    const ops = [];
    for (let r = 0; r < ROWS_PER_STMT && written < total; r++, written++) {
      const p = proto();
      const ts = now - Math.floor(rnd() * span);
      const height = 968900 - Math.floor((now - ts) / 600);
      const txid = 'lt' + written.toString(16).padStart(62, '0');
      const addr = pick(ADDRS);
      const dupGroup = rnd() < 0.3 ? Math.floor(rnd() * 20000) : written;
      const tick = p.endsWith('-20') ? pick(TICKS) : null;
      const content =
        p === 'text'
          ? `synthetic human message number ${dupGroup} about keys, hope and fees`
          : p.endsWith('-20')
            ? `{"p":"${p}","op":"transfer","tick":"${tick}","amt":"${dupGroup}"}`
            : p === 'thorchain'
              ? `OUT:${dupGroup.toString(16).padStart(64, 'A')}`
              : `${p} payload ${dupGroup}`;
      const hash = ('h' + dupGroup + p).padEnd(32, '0').slice(0, 32);
      const isDup = rnd() < 0.2 ? 1 : 0;
      msgs.push(
        `(${q(txid)},${q(addr)},${q(content)},0,NULL,${1000 + Math.floor(rnd() * 5000)},${(1 + rnd() * 10).toFixed(1)},${ts},${height},${q(pick(ADDRS))},${q(p)},${q(addr)},${addr === '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' ? q(addr) : 'NULL'},${q(hash)},${ts},${isDup},1,${Math.floor(rnd() * 50)})`
      );
      ops.push(`(${q(txid)},0,${q(p)},${p.endsWith('-20') ? "'transfer'" : 'NULL'},${tick ? q(tick) : 'NULL'},${p.endsWith('-20') ? q(String(dupGroup)) : 'NULL'},NULL,${ts})`);
    }
    sql +=
      'INSERT OR IGNORE INTO messages (txid,address,content,is_mempool,raw_hex,fee_sats,fee_rate,block_time,block_height,sender,protocol,recipient,monitored_address,content_hash,ts,is_dup,dup_count,likes) VALUES\n' +
      msgs.join(',\n') +
      ';\n';
    sql += 'INSERT OR IGNORE INTO ops (txid,vout,protocol,op,tick,amount,payload_hex,ts) VALUES\n' + ops.join(',\n') + ';\n';
  }
  const path = join(outDir, `seed-${String(file++).padStart(3, '0')}.sql`);
  writeFileSync(path, sql);
  files.push(path);
}
console.log(`wrote ${files.length} files, ${written} rows → ${outDir}`);

for (const f of files) {
  const t0 = Date.now();
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'opreturn-monitor', '--local', '--file', f], { stdio: 'ignore' });
  console.log(`${f} applied in ${Date.now() - t0} ms`);
}
console.log('done');
