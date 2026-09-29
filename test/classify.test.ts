import { describe, expect, it } from 'vitest';
import {
  BATCH_SYSTEM_PROMPT,
  CATEGORIES,
  CATEGORY_DEFINITIONS,
  aiHeaders,
  buildBatchUserPrompt,
  categoryFromSlug,
  categorySlug,
  classifyBatch,
  isCategory,
  matchCategory,
  parseBatchResponse,
} from '../src/classify';
import type { Env } from '../src/types';

describe('taxonomy', () => {
  it('has eleven labels with unique, round-tripping slugs and a definition each', () => {
    expect(CATEGORIES.length).toBe(11);
    const slugs = CATEGORIES.map(categorySlug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of CATEGORIES) {
      expect(categoryFromSlug(categorySlug(c))).toBe(c);
      expect(CATEGORY_DEFINITIONS[c].length).toBeGreaterThan(20);
    }
    expect(categorySlug('Legal / Ownership Notices')).toBe('legal-ownership-notices');
    expect(isCategory('Contact / Negotiation')).toBe(true);
    expect(isCategory('Contact')).toBe(false);
  });

  it('keeps the original seven slugs stable', () => {
    for (const s of ['laundry-service-ads', 'begging-victim-appeals', 'threats-hostility', 'prompt-injection', 'haiku-philosophical', 'self-deprecating-black-humor', 'other']) {
      expect(categoryFromSlug(s), s).not.toBeNull();
    }
  });

  it('prompts list every label with its definition', () => {
    for (const c of CATEGORIES) expect(BATCH_SYSTEM_PROMPT).toContain(`- ${c}: ${CATEGORY_DEFINITIONS[c]}`);
    const u = buildBatchUserPrompt([{ id: 1, content: 'hi' }, { id: 2, content: 'x'.repeat(600) }]);
    expect(u).toContain('[1] hi');
    expect(u).toContain('[2] ' + 'x'.repeat(500));
    expect(u).not.toContain('x'.repeat(501));
  });
});

describe('matchCategory', () => {
  it('matches exact labels, label prefixes and first words, in any case or punctuation', () => {
    expect(matchCategory('Legal / Ownership Notices')).toBe('Legal / Ownership Notices');
    expect(matchCategory('"politics / activism".')).toBe('Politics / Activism');
    expect(matchCategory('Graffiti / Greetings (a hello)')).toBe('Graffiti / Greetings');
    expect(matchCategory('Laundry')).toBe('Laundry / Service Ads');
    expect(matchCategory('Begging.')).toBe('Begging / Victim Appeals');
    expect(matchCategory('Self deprecating')).toBe('Self-deprecating / Black Humor');
    expect(matchCategory('self-deprecating black humor')).toBe('Self-deprecating / Black Humor');
    expect(matchCategory('other')).toBe('Other');
  });
  it('does not treat a sentence that merely mentions a label word as a hit', () => {
    expect(matchCategory('This message is about politics but reads as a greeting')).toBeNull();
    expect(matchCategory('I cannot classify this')).toBeNull();
    expect(matchCategory('')).toBeNull();
  });
});

describe('parseBatchResponse', () => {
  it('aligns lines to positions and leaves unparseable lines null for the single retry', () => {
    const r = parseBatchResponse('1: Threats / Hostility\n2. Contact / Negotiation\n[3] something else entirely\n4) Other\n9: Other', 4);
    expect(r).toEqual(['Threats / Hostility', 'Contact / Negotiation', null, 'Other']);
  });
});

describe('classifyBatch', () => {
  const env = { OPENAI_API_KEY: 'k', OPENAI_API_BASE: 'https://ai.example/v1', OPENAI_MODEL: 'm', AI_DELAY_MS: '1', AI_BATCH_SIZE: '10' } as unknown as Env;

  it('sends the session and user-agent headers, applies labels and reports no error', async () => {
    const seen: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ choices: [{ message: { content: '1: Legal / Ownership Notices\n2: Graffiti / Greetings' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await classifyBatch([{ id: 10, content: 'NOTICE TO OWNER' }, { id: 11, content: 'hello blockchain' }], env, fetchFn);
    expect(r.categories).toEqual({ 10: 'Legal / Ownership Notices', 11: 'Graffiti / Greetings' });
    expect(r.error).toBeNull();
    expect(r.calls).toBe(1);
    expect(seen[0].url).toBe('https://ai.example/v1/chat/completions');
    expect(seen[0].headers['x-opencode-session']).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen[0].headers['user-agent']).toContain('opreturn-classifier');
    expect(seen[0].headers.authorization).toBe('Bearer k');
    expect(aiHeaders('k', 's')['x-opencode-session']).toBe('s');
  });

  it('treats an empty 200 reply as an error so it shows up in the status', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 })) as unknown as typeof fetch;
    const r = await classifyBatch([{ id: 1, content: 'a' }], env, fetchFn);
    expect(r.categories).toEqual({});
    expect(r.error).toContain('empty');
  });

  it('surfaces a 400 from the endpoint instead of swallowing it, and does not fan out singles', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response(JSON.stringify({ type: 'error', error: { type: 'MissingSessionID', message: 'Request is missing x-opencode-session' } }), { status: 400 });
    }) as unknown as typeof fetch;
    const r = await classifyBatch([{ id: 1, content: 'a' }, { id: 2, content: 'b' }], env, fetchFn);
    expect(r.categories).toEqual({});
    expect(r.error).toContain('400');
    expect(r.error).toContain('MissingSessionID');
    expect(calls).toBe(1);
  });

  it('retries only the lines the batch reply missed, reusing the same session', async () => {
    const sessions = new Set<string>();
    let n = 0;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      sessions.add((init.headers as Record<string, string>)['x-opencode-session']);
      n++;
      const content = n === 1 ? '1: Other' : 'Politics / Activism';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await classifyBatch([{ id: 1, content: 'kl' }, { id: 2, content: 'Stand with the people' }], env, fetchFn);
    expect(r.categories).toEqual({ 1: 'Other', 2: 'Politics / Activism' });
    expect(r.calls).toBe(2);
    expect(sessions.size).toBe(1);
  });

  it('reports a missing key without calling anything', async () => {
    const r = await classifyBatch([{ id: 1, content: 'x' }], {} as Env, (async () => { throw new Error('no'); }) as unknown as typeof fetch);
    expect(r.error).toContain('OPENAI_API_KEY');
  });
});
