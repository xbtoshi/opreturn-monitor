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

/**
 * Classify a message using any OpenAI-compatible /chat/completions endpoint.
 * Returns null on any failure so callers can fall back gracefully.
 */
export async function classifyMessage(
  content: string,
  env: Env,
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  const base = (env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const key = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!key) return null;

  try {
    const res = await fetchFn(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 16,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Classify this message:\n"""${content.slice(0, 500)}"""`,
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`AI API responded ${res.status}`);

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    return normalizeCategory(text);
  } catch {
    return null;
  }
}

function normalizeCategory(text: string): string {
  const cleaned = text.replace(/["'`.,;:!?()\[\]{}<>]/g, '').trim().toLowerCase();
  for (const cat of CATEGORIES) {
    if (cleaned === cat.toLowerCase() || cleaned.includes(cat.toLowerCase())) return cat;
  }
  return 'Other';
}
