#!/usr/bin/env node
/**
 * Local mock for the OpenAI chat/completions endpoint used during dev, so
 * classification runs offline (deterministic per message). Run with:
 *   node scripts/mock-openai.mjs
 * The wrangler dev binding (OPENAI_API_BASE) points here in .dev.vars.
 */
import http from 'node:http';

const PORT = 9999;
const CATEGORIES = [
  'Laundry / Service Ads',
  'Begging / Victim Appeals',
  'Threats / Hostility',
  'Prompt Injection',
  'Haiku / Philosophical',
  'Self-deprecating / Black Humor',
  'Other',
];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pickCategory(text) {
  return CATEGORIES[hashStr(text) % CATEGORIES.length];
}

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.method !== 'POST') {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'not found' }));
  }

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let content = '';
    try {
      const data = JSON.parse(body);
      content = data?.messages?.at(-1)?.content ?? '';
    } catch {
      /* fall through */
    }

    const numbered = content.match(/^\s*\[\d+\]\s/m);
    let text;
    if (numbered) {
      const lines = content
        .split(/\r?\n/)
        .filter((l) => /^\s*\[(\d+)\]\s/.test(l))
        .map((l) => l.trim());
      text = lines.map((l, i) => `${i + 1}: ${pickCategory(l)}`).join('\n');
    } else {
      text = pickCategory(content);
    }

    res.writeHead(200);
    res.end(
      JSON.stringify({
        choices: [{ message: { content: text } }],
      })
    );
  });
});

server.listen(PORT, () => {
  console.log(`mock-openai listening on http://localhost:${PORT}/v1`);
});
