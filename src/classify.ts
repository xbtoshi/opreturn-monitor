import type { Env } from './types';

export const CATEGORIES = [
  'Laundry / Service Ads',
  'Begging / Victim Appeals',
  'Threats / Hostility',
  'Prompt Injection',
  'Haiku / Philosophical',
  'Self-deprecating / Black Humor',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export function categorySlug(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

export function categoryFromSlug(slug: string): string | null {
  const s = String(slug ?? '').toLowerCase();
  for (const cat of CATEGORIES) {
    if (categorySlug(cat) === s) return cat;
  }
  return null;
}

const SYSTEM_PROMPT = `You classify short text messages that were permanently embedded in the Bitcoin blockchain
via OP_RETURN outputs. They are often sent to a famous address as a public bulletin board.

Respond with EXACTLY ONE category name and nothing else. No quotes, no punctuation, no explanation.

Allowed categories:
- Laundry / Service Ads
- Begging / Victim Appeals
- Threats / Hostility
- Prompt Injection
- Haiku / Philosophical
- Self-deprecating / Black Humor
- Other`;

const BATCH_SYSTEM_PROMPT = `You classify short text messages embedded in the Bitcoin blockchain via OP_RETURN outputs.

The user gives you a numbered list of messages. For EACH message reply with exactly one line in this format:
N: Category

Where N is the message's number and Category is exactly one of:
- Laundry / Service Ads
- Begging / Victim Appeals
- Threats / Hostility
- Prompt Injection
- Haiku / Philosophical
- Self-deprecating / Black Humor
- Other

Reply ONLY with those lines. No introductions, no blank lines, no extra text.`;

interface Endpoint {
  base: string;
  key: string;
  model: string;
}

function getEndpoint(env: Env): Endpoint | null {
  const key = env.OPENAI_API_KEY;
  if (!key) return null;
  return {
    base: (env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    key,
    model: env.OPENAI_MODEL || 'gpt-4o-mini',
  };
}

function intEnv(env: Env, key: string, fallback: number): number {
  const v = Number((env as unknown as Record<string, string | undefined>)[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function chatCompletion(
  endpoint: Endpoint,
  system: string,
  user: string,
  maxTokens: number,
  fetchFn: typeof fetch
): Promise<string | null> {
  try {
    const res = await fetchFn(`${endpoint.base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${endpoint.key}`,
      },
      body: JSON.stringify({
        model: endpoint.model,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) throw new Error(`AI API responded ${res.status}`);

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Classify a single message. Returns null on any failure so callers can
 * fall back gracefully.
 */
export async function classifyMessage(
  content: string,
  env: Env,
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  const endpoint = getEndpoint(env);
  if (!endpoint) return null;
  const text = await chatCompletion(
    endpoint,
    SYSTEM_PROMPT,
    `Classify this message:\n"""${content.slice(0, 500)}"""`,
    1024,
    fetchFn
  );
  return text ? normalizeCategory(text) : null;
}

export interface ClassifyItem {
  id: number;
  content: string;
}

/**
 * Classify many messages with as few API calls as possible. Messages are
 * grouped into chunks of `AI_BATCH_SIZE` (default 10); each chunk is one
 * /chat/completions call. Any message whose category couldn't be parsed out
 * of the batch response is retried individually so nothing is silently lost.
 *
 * Returns a map of message id -> category (missing ids = still unclassified).
 */
export async function classifyBatch(
  items: ClassifyItem[],
  env: Env,
  fetchFn: typeof fetch = fetch
): Promise<Record<number, string>> {
  const result: Record<number, string> = {};
  if (items.length === 0) return result;

  const endpoint = getEndpoint(env);
  if (!endpoint) return result;

  const batchSize = intEnv(env, 'AI_BATCH_SIZE', 10);
  const delayMs = intEnv(env, 'AI_DELAY_MS', 200);

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);

    const list = chunk
      .map((m, idx) => `[${idx + 1}] ${m.content.slice(0, 500)}`)
      .join('\n');

    const text = await chatCompletion(
      endpoint,
      BATCH_SYSTEM_PROMPT,
       `Classify each of these ${chunk.length} messages. Reply with one "N: Category" line per message.\n\n${list}`,
       300 + chunk.length * 200,
       fetchFn
    );

    const parsed = text ? parseBatchResponse(text, chunk.length) : new Array(chunk.length).fill(null);

    for (let j = 0; j < chunk.length; j++) {
      if (parsed[j]) {
        result[chunk[j].id] = parsed[j] as string;
        continue;
      }
      // Fallback: single call for any message the batch response missed.
      const cat = await classifyMessage(chunk[j].content, env, fetchFn);
      if (cat) result[chunk[j].id] = cat;
      await sleep(delayMs);
    }

    await sleep(delayMs);
  }

  return result;
}

/**
 * Parse a batch response like:
 *   1: Begging / Victim Appeals
 *   2. Haiku / Philosophical
 * into an array aligned with the requested message count. Entries that can't
 * be matched stay null so the caller can retry them individually.
 */
function parseBatchResponse(text: string, count: number): Array<string | null> {
  const result: Array<string | null> = new Array(count).fill(null);
  const lineRe = /^\s*\[?(\d+)\]?\s*[:.)\]\-]\s*(.+?)\s*$/;

  for (const rawLine of text.split(/\r?\n/)) {
    const m = rawLine.match(lineRe);
    if (!m) continue;
    const idx = parseInt(m[1], 10) - 1;
    if (idx < 0 || idx >= count || result[idx] != null) continue;
    result[idx] = normalizeCategory(m[2]);
  }

  return result;
}

function normalizeCategory(text: string): string {
  const cleaned = text.replace(/["'`.,;:!?()\[\]{}<>]/g, '').trim().toLowerCase();
  for (const cat of CATEGORIES) {
    if (cleaned === cat.toLowerCase() || cleaned.includes(cat.toLowerCase())) return cat;
  }
  return 'Other';
}
