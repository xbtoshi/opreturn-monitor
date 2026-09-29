/**
 * Offline reclassification of the human-message archive with Claude.
 *
 *   node --experimental-strip-types scripts/reclassify.mts            # dry run -> JSONL
 *   node --experimental-strip-types scripts/reclassify.mts --apply <jsonl>
 *   node --experimental-strip-types scripts/reclassify.mts --revert <jsonl>
 *
 * Options: --base https://opreturn.xyz  --skip-reparse  --limit N (rows, for a trial)
 *          --out path.jsonl  --start N (resume an apply/revert at chunk N)
 *
 * The production cron keeps using the OpenAI-compatible endpoint; this script
 * is the one-off pass that relabels existing rows through the admin API with
 * the exact prompt the Worker uses. Credentials come from the environment or
 * .dev.vars: ADMIN_KEY and ANTHROPIC_API_KEY. Nothing is written without --apply.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { BATCH_SYSTEM_PROMPT, CATEGORIES, buildBatchUserPrompt, parseBatchResponse, type ClassifyItem } from '../src/classify.ts';

const BULK_MODEL = 'claude-haiku-4-5';
const ESCALATION_MODEL = 'claude-sonnet-5';
const PRICE: Record<string, { input: number; output: number }> = {
  [BULK_MODEL]: { input: 1, output: 5 },
  [ESCALATION_MODEL]: { input: 2, output: 10 },
};
const BATCH = 20;
const CONCURRENCY = 4;

// ---- args & credentials ----------------------------------------------------

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, dflt?: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};

function devVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.dev.vars')) return undefined;
  for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && m[1] === name) return m[2].replace(/^"(.*)"$/, '$1');
  }
  return undefined;
}

const BASE = (opt('--base', 'https://opreturn.xyz') as string).replace(/\/+$/, '');
const ADMIN_KEY = devVar('ADMIN_KEY');
if (!ADMIN_KEY) fail('ADMIN_KEY missing (environment or .dev.vars)');

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

async function admin<T>(method: 'GET' | 'POST', path: string, body?: unknown, tries = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'x-admin-key': ADMIN_KEY as string, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
      return JSON.parse(text) as T;
    } catch (e) {
      if (attempt >= tries) throw e;
      await sleep(1500 * attempt);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- record shape ----------------------------------------------------------

interface Row {
  id: number;
  txid: string;
  content: string;
  category: string | null;
}
interface Record_ {
  id: number;
  txid: string;
  content: string;
  prev: string | null;
  next: string;
  model: string;
}

// ---- apply / revert --------------------------------------------------------

async function postAssignments(items: Array<{ id: number; category: string | null }>, start: number): Promise<void> {
  const chunks: Array<typeof items> = [];
  for (let i = 0; i < items.length; i += 100) chunks.push(items.slice(i, i + 100));
  let updated = 0;
  let propagated = 0;
  for (let i = start; i < chunks.length; i++) {
    try {
      const r = await admin<{ updated: number; propagated: number }>('POST', '/api/admin/categories', chunks[i]);
      updated += r.updated;
      propagated += r.propagated;
      process.stdout.write(`\rchunk ${i + 1}/${chunks.length}  updated ${updated}  groups propagated ${propagated}`);
    } catch (e) {
      console.error(`\nchunk ${i} failed: ${String(e)}\nresume with --start ${i}`);
      process.exit(2);
    }
  }
  console.log('\ndone');
}

function readJsonl(path: string): Record_[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record_);
}

if (flag('--apply') || flag('--revert')) {
  const path = opt(flag('--apply') ? '--apply' : '--revert');
  if (!path || !existsSync(path)) fail('pass the JSONL written by the dry run');
  const recs = readJsonl(path);
  const start = Number(opt('--start', '0'));
  if (flag('--apply')) {
    console.log(`applying ${recs.length} labels from ${path}`);
    await postAssignments(recs.map((r) => ({ id: r.id, category: r.next })), start);
  } else {
    console.log(`reverting ${recs.length} rows to their previous labels from ${path}`);
    await postAssignments(recs.map((r) => ({ id: r.id, category: r.prev })), start);
  }
  process.exit(0);
}

// ---- dry run ---------------------------------------------------------------

const ANTHROPIC_API_KEY = devVar('ANTHROPIC_API_KEY');
if (!ANTHROPIC_API_KEY) fail('ANTHROPIC_API_KEY missing (environment or .dev.vars). Add it, then rerun.');
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 3 });

for (const m of [BULK_MODEL, ESCALATION_MODEL]) {
  try {
    await client.models.retrieve(m);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) fail('Anthropic key rejected (401)');
    if (e instanceof Anthropic.NotFoundError) fail(`model id not found: ${m}`);
    throw e;
  }
}

// 1. Parse never-parsed rows, then re-run the residue detectors over text rows,
//    so machine text leaves the pool before anything is sent to a model.
if (!flag('--skip-reparse')) {
  for (;;) {
    const r = await admin<{ reparsed: number }>('POST', '/api/admin/reparse?max=2000');
    process.stdout.write(`\rlegacy reparse: ${r.reparsed} rows`);
    if (r.reparsed === 0) break;
  }
  console.log();
  let after = 0;
  let scanned = 0;
  let changed = 0;
  for (;;) {
    const r = await admin<{ scanned: number; changed: number; next_after: number | null }>('POST', `/api/admin/reparse?scope=text&after=${after}&limit=500`);
    scanned += r.scanned;
    changed += r.changed;
    process.stdout.write(`\rreparse: scanned ${scanned}  moved out of text ${changed}`);
    if (r.next_after == null) break;
    after = r.next_after;
  }
  console.log();
}

// 2. Page every text group representative.
const rows: Row[] = [];
const limitRows = Number(opt('--limit', '0'));
{
  let after = 0;
  for (;;) {
    const r = await admin<{ rows: Row[]; next_after: number | null }>('GET', `/api/admin/messages/text?after=${after}&limit=500`);
    rows.push(...r.rows);
    process.stdout.write(`\rfetched ${rows.length} rows`);
    if (r.next_after == null || (limitRows && rows.length >= limitRows)) break;
    after = r.next_after;
  }
  console.log();
}
const work = limitRows ? rows.slice(0, limitRows) : rows;

// 3. Classify: Haiku in batches, Sonnet for whatever Haiku's reply left unparsed.
const usage: Record<string, { input: number; output: number; calls: number }> = {};
function addUsage(model: string, u: { input_tokens: number; output_tokens: number }) {
  const s = (usage[model] ??= { input: 0, output: 0, calls: 0 });
  s.input += u.input_tokens;
  s.output += u.output_tokens;
  s.calls++;
}

async function ask(model: string, chunk: ClassifyItem[]): Promise<Array<string | null>> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: model === ESCALATION_MODEL ? 4096 : 1024,
        ...(model === ESCALATION_MODEL ? { output_config: { effort: 'low' as const } } : { temperature: 0 }),
        system: BATCH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildBatchUserPrompt(chunk) }],
      });
      addUsage(model, res.usage);
      if (res.stop_reason === 'refusal') return new Array<string | null>(chunk.length).fill(null);
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return parseBatchResponse(text, chunk.length);
    } catch (e) {
      if ((e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionError || (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500)) && attempt < 5) {
        await sleep(2000 * attempt);
        continue;
      }
      throw e;
    }
  }
}

const records: Record_[] = [];
const chunks: Row[][] = [];
for (let i = 0; i < work.length; i += BATCH) chunks.push(work.slice(i, i + BATCH));
let done = 0;
let escalated = 0;
let unresolved = 0;

async function worker() {
  for (;;) {
    const chunk = chunks.shift();
    if (!chunk) return;
    const items = chunk.map((r) => ({ id: r.id, content: r.content }));
    const first = await ask(BULK_MODEL, items);
    const misses = items.filter((_, i) => first[i] == null);
    let second: Array<string | null> = [];
    if (misses.length) {
      escalated += misses.length;
      second = await ask(ESCALATION_MODEL, misses);
    }
    chunk.forEach((r, i) => {
      let next = first[i];
      let model = BULK_MODEL;
      if (next == null) {
        const j = misses.findIndex((m) => m.id === r.id);
        next = second[j] ?? null;
        model = ESCALATION_MODEL;
      }
      if (next == null) {
        unresolved++;
        next = 'Other';
        model = 'fallback';
      }
      records.push({ id: r.id, txid: r.txid, content: r.content.slice(0, 200), prev: r.category, next, model });
    });
    done += chunk.length;
    process.stdout.write(`\rclassified ${done}/${work.length}  escalated ${escalated}  unresolved ${unresolved}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log();
records.sort((a, b) => a.id - b.id);

// 4. Report.
const out = opt('--out', `reclassify-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`) as string;
writeFileSync(out, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

const dist = (pick: (r: Record_) => string | null) => {
  const m = new Map<string, number>();
  for (const r of records) m.set(pick(r) ?? '(unclassified)', (m.get(pick(r) ?? '(unclassified)') ?? 0) + 1);
  return m;
};
const before = dist((r) => r.prev);
const after = dist((r) => r.next);
console.log('\ncategory                          before   after');
for (const c of [...CATEGORIES, '(unclassified)']) {
  const b = before.get(c) ?? 0;
  const a = after.get(c) ?? 0;
  if (b || a) console.log(`${c.padEnd(32)} ${String(b).padStart(6)} ${String(a).padStart(7)}`);
}
const changed = records.filter((r) => r.prev && r.prev !== r.next);
console.log(`\nrows ${records.length}, previously labelled ${records.filter((r) => r.prev).length}, of which relabelled ${changed.length}`);
console.log('\nsample of relabelled rows:');
for (const r of changed.slice(0, 30)) console.log(`  ${r.prev} -> ${r.next}  | ${r.content.replace(/\s+/g, ' ').slice(0, 80)}`);
console.log('\nsample of newly labelled rows:');
for (const r of records.filter((r) => !r.prev).slice(0, 30)) console.log(`  ${r.next}  | ${r.content.replace(/\s+/g, ' ').slice(0, 80)}`);

let cost = 0;
for (const [model, u] of Object.entries(usage)) {
  const p = PRICE[model] ?? { input: 0, output: 0 };
  const c = (u.input * p.input + u.output * p.output) / 1e6;
  cost += c;
  console.log(`\n${model}: ${u.calls} calls, ${u.input} in / ${u.output} out tokens, ~$${c.toFixed(3)}`);
}
console.log(`total ~$${cost.toFixed(3)}\n\nwrote ${out}\napply with: node --experimental-strip-types scripts/reclassify.mts --apply ${out}`);
