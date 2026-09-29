import type { CategoryStat, ChainStats } from './db';
import FV, { type FeedView } from './feedview.js';
import { CATEGORIES, CATEGORY_DEFINITIONS, categorySlug } from './classify';
import { protocolLabel } from './protocols';
import { CORE30, HISTORY_CAPS, SPARROW } from './facts';

const HOSTILE_CATEGORIES = new Set(['Prompt Injection', 'Threats / Hostility', 'Laundry / Service Ads']);
import type { Address, CollectionWithStats, Message } from './types';

// ---------------------------------------------------------------------------
// Helpers: XML / HTML Escaping
// ---------------------------------------------------------------------------

export function escHtml(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escXml(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function shortAddr(a: string): string {
  return a.length > 16 ? a.slice(0, 10) + '\u2026' + a.slice(-4) : a;
}

// ---------------------------------------------------------------------------
// 1. Robots.txt with Generative / AI Bot Directives & Content Signals
// ---------------------------------------------------------------------------

export function generateRobotsTxt(siteUrl: string): string {
  return `# The Permanent Record — Bitcoin OP_RETURN Monitor
# https://opreturn.xyz — Immutable on-chain transmission archive
# RFC 9309 & ContentSignals.org Compliant

Content-Signal: search=yes, ai-train=yes, ai-input=yes

User-agent: *
Allow: /
Disallow: /api/admin/
Disallow: /api/cron/
Disallow: /api/like
Disallow: /api/suggest

# Generative Search & AI Crawlers (AEO / GEO / SearchGPT)
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: meta-externalagent
Allow: /

# Canonical Sitemaps
Sitemap: ${siteUrl}/sitemap.xml

# LLM Agent Documentation & Standards
# Context (llms.txt): ${siteUrl}/llms.txt
# Technical Dossier: ${siteUrl}/llms-full.txt
# API Catalog (RFC 9727): ${siteUrl}/.well-known/api-catalog
# OpenAPI Spec: ${siteUrl}/api/openapi.json
# Agent Card (A2A): ${siteUrl}/.well-known/agent-card.json
# MCP Server Card (SEP-1649): ${siteUrl}/.well-known/mcp/server-card.json
# Auth.md: ${siteUrl}/auth.md
`;
}

// ---------------------------------------------------------------------------
// 2. Generative Engine Optimization: llms.txt & llms-full.txt
// ---------------------------------------------------------------------------

export function generateLlmsTxt(siteUrl: string, guides: Array<{ slug: string; title: string; description: string }> = []): string {
  const LEARN_INDEX = guides.map((g) => `- [${g.title}](${siteUrl}/learn/${g.slug}) — ${g.description}`).join('\n') || `- ${siteUrl}/learn`;
  return `# The Permanent Record — Bitcoin OP_RETURN Monitor

> opreturn.xyz is a real-time, high-availability monitor and historical archive for arbitrary data and messages embedded inside the Bitcoin blockchain via OP_RETURN outputs. It tracks active bulletin boards, hacker communications, dormant wallet notices, and cultural memorials, with AI categorization and high-performance edge caching.

## What is Bitcoin OP_RETURN?

- **Opcode Mechanics**: \`OP_RETURN\` (\`0x6a\`) is a script opcode that marks a transaction output as provably unspendable.
- **UTXO Set Health**: Because provably unspendable outputs can never be spent, compliant nodes immediately prune them from their RAM-resident UTXO (Unspent Transaction Output) set, eliminating UTXO bloat while permanently committing the data to the blockchain history.
- **Data Limits**: ${HISTORY_CAPS} ${CORE30.summary}
- **Cost**: Embedding data requires paying miner fees proportional to transaction virtual size (vBytes), with output value typically set to 0 sats.
- **Immutability**: Once confirmed inside a Bitcoin block, transmissions are mathematically unalterable, uncensorable, and permanently replicated across tens of thousands of nodes worldwide.

## Monitored Collections & On-Chain Phenomena

The archive focuses on addresses that have evolved into public bulletin boards:
1. **Bitget Hack Bulletin Board**: Largest unspent Bitcoin parcels from the 24 September 2026 Bitget hot-wallet breach (~190 BTC across eight addresses on Bitget's public stolen-funds tracker).
2. **Liquid Network Peg-Out Bulletin Board**: Addresses from the September 2026 Liquid Network whitehat incident (~3,996 BTC peg-out negotiation between hackers and Blockstream security).
3. **Coldcard Exploit Bulletin Board**: Primary holding addresses from the July-August 2026 Coldcard firmware RNG exploit, filled with laundry ads, victim pleas, threats, and prompt injections.
4. **High-Value Dormant Wallet Notices**: Early 2010-2011 high-balance addresses (including the Mt. Gox 1Feex address) targeted with legal notices, ownership claims, and phishing attempts.
5. **Genesis & Satoshi Tribute**: The Genesis block address (\`1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa\`), receiving ongoing memorials and prayers to Satoshi Nakamoto.
6. **Russian Intelligence Marking Campaign**: Addresses marked in 2022 via OP_RETURN as associated with GRU / SVR / FSB intelligence agencies.
7. **Cultural Memorials & Digital Graffiti**: Permanent personal tributes, biblical verses, and vanity address communications.
8. **Historical Hacker Negotiation Boards**: Historic addresses used for public bounty negotiations and victim-attacker dialogue.

## Protocol Registry (full-chain explorer)

Every block's OP_RETURN outputs are scanned, not only monitored addresses. Each output is decoded before any AI sees it:
- \`text\`: human-readable messages (the only kind sent to the classifier)
- JSON token ops such as \`ico-20\`, \`crc-20\`, \`brc-20\` (\`{"p":"...","op":"...","tick":"...","amt":"..."}\`) — e.g. $LEAF mints
- \`omni\` (Omni Layer / Tether simple sends), \`thorchain\` (OUT:/REFUND: and swap memos), \`bridge-memo\` (to:USDT(TRON):... style), \`evm-hash\`, \`lifi\`
- Merge-mining and sidechain tags: \`rootstock\`, \`stacks\`, \`core-dao\`, \`exsat\`, \`syscoin\`
- \`runes\` (OP_RETURN OP_13 runestones, ~98% of outputs) and opaque \`binary\` payloads are counted per block, not stored

Protocol pages: ${siteUrl}/p/{protocol} · Ticker pages: ${siteUrl}/tick/{TICK} · Block pages: ${siteUrl}/block/{height}

## AI Classification Taxonomy

Human-readable transmissions are classified into ${CATEGORIES.length} discrete categories:
${CATEGORIES.map((c) => `- \`${c}\`: ${CATEGORY_DEFINITIONS[c]}`).join('\n')}

## Public REST API

- \`GET ${siteUrl}/api/collections\` — All collections with address & message counts.
- \`GET ${siteUrl}/api/messages?sort=hot|new&limit=50&collection_id=&address=&category=&protocol=&tick=&kind=text|all\` — Filtered transmission feed (global feed defaults to human text; kind=all includes every protocol).
- \`GET ${siteUrl}/api/protocols?days=\` — Distinct transactions per protocol (all time by default; days = 1/7/30/90/365).
- \`GET ${siteUrl}/api/ticks?protocol=&days=\` — Token tickers by activity (all time by default).
- \`GET ${siteUrl}/api/chain\` — Block census: blocks scanned, OP_RETURN outputs, Runes share, recent blocks.
- \`GET ${siteUrl}/api/block/:height\` — One scanned block's OP_RETURN census.
- \`GET ${siteUrl}/api/chat?collection_id=&address=\` — Chronological conversation stream.
- \`GET ${siteUrl}/api/categories\` — Category distribution and counts.
- \`GET ${siteUrl}/api/message/:key\` — Message lookup by ID or txid.
- \`GET ${siteUrl}/api/price?ts=\` — Historical USD price at block timestamp.

## Guides (Learn)

Long-form explainers, also available as Markdown via \`Accept: text/markdown\`:
${LEARN_INDEX}

## Machine Discovery & Agent Standards

- Full Technical Dossier: ${siteUrl}/llms-full.txt
- Live Transmissions Feed: ${siteUrl}/feed
- Curated Collections: ${siteUrl}/collections
- Field Manual (How to Etch): ${siteUrl}/guide
- Canonical Sitemap: ${siteUrl}/sitemap.xml
- RFC 9727 API Catalog: ${siteUrl}/.well-known/api-catalog
- OpenAPI Specification: ${siteUrl}/api/openapi.json
- A2A Agent Card: ${siteUrl}/.well-known/agent-card.json
- MCP Server Card: ${siteUrl}/.well-known/mcp/server-card.json
- Agent Authentication (Auth.md): ${siteUrl}/auth.md
`;
}

export function generateLlmsFullTxt(
  siteUrl: string,
  collections: CollectionWithStats[],
  addresses: Address[]
): string {
  const addrsByCol = new Map<number, Address[]>();
  for (const a of addresses) {
    const list = addrsByCol.get(a.collection_id) || [];
    list.push(a);
    addrsByCol.set(a.collection_id, list);
  }

  let colSection = '';
  for (const col of collections) {
    colSection += `### ${col.name}\n`;
    colSection += `- **Slug**: \`${col.slug || col.id}\`\n`;
    colSection += `- **Description**: ${col.description || 'No description'}\n`;
    colSection += `- **Metrics**: ${col.address_count} monitored addresses, ${col.message_count} archived messages\n`;
    colSection += `- **Feed**: ${siteUrl}/c/${col.slug || col.id}\n`;
    colSection += `- **Chat Room**: ${siteUrl}/c/${col.slug || col.id}/chat\n`;

    const addrs = addrsByCol.get(col.id) || [];
    if (addrs.length) {
      colSection += `- **Monitored Addresses**:\n`;
      for (const a of addrs) {
        colSection += `  - \`${a.address}\`${a.label ? ` — *${a.label}*` : ''}\n`;
      }
    }
    colSection += '\n';
  }

  return `# The Permanent Record — Full Technical Reference & Protocol Dossier
# Site: ${siteUrl}
# Canonical Manifest: ${siteUrl}/llms.txt

## 1. System Architecture

The Permanent Record is an edge-native Bitcoin OP_RETURN monitor built on:
- **Cloudflare Workers**: High-performance V8 isolate runtime handling HTTP routing, content negotiation, and SSR.
- **Cloudflare D1 (SQLite)**: Globally replicated database storing collections, monitored addresses, and classified messages.
- **Hono**: Ultrafast, zero-dependency web framework.
- **mempool.space API**: Multi-endpoint live blockchain polling (confirmed and unconfirmed mempool transactions).
- **Edge Resvg (WASM)**: On-demand serverless generation of OpenGraph PNG social cards.
- **Proof-of-Work Mining (16-bit SHA-256)**: Client-side spam mitigation for likes and address suggestions.

---

## 2. Field Manual: How to Etch a Message onto Bitcoin

An OP_RETURN output lets you attach arbitrary binary or UTF-8 data to a Bitcoin transaction.

### Step 1: Understand the Constraints
- Standard UTF-8 text payload.
- ${CORE30.summary}
- Cost: Standard miner fees (sat/vB) for the transaction virtual size.
- 0 sats output value (provably unspendable).

### Step 2: Constructing with Bitcoin Core CLI
\`\`\`bash
# 1. Encode your text message to hex
DATA=$(printf 'gm, permanent record' | xxd -p -c 999)

# 2. Create raw transaction with OP_RETURN output and change
bitcoin-cli -named createrawtransaction \\
  inputs='[{"txid":"<your-utxo-txid>","vout":0}]' \\
  outputs='[{"data":"'$DATA'"},{"<change-address>":0.00095}]'

# 3. Sign transaction
bitcoin-cli signrawtransactionwithwallet "<raw-tx-hex>"

# 4. Broadcast to the mempool
bitcoin-cli sendrawtransaction "<signed-hex>"
\`\`\`

### Step 3: Constructing with a wallet
1. Navigate to **Send**.
2. Click **Add OP_RETURN** in the transaction outputs section.
3. Paste plain text or hex data.
4. Set recipient change address and appropriate sat/vB fee rate.
5. Sign and broadcast.

---

## 3. Curated Collections Catalog

${colSection}

---

## 4. REST API Endpoint Specifications

### GET /api/collections
Returns all tracked collections with live statistical tallies.

### GET /api/messages
Query parameters:
- \`sort\`: 'hot' (by likes) or 'new' (chronological)
- \`limit\`: 1 to 100 (default 50)
- \`collection_id\`: Filter by numeric collection ID
- \`address\`: Filter by recipient Bitcoin address
- \`category\`: Filter by classification category slug
- \`before\`: Keyset cursor for pagination (\`likes:ts:id\` or \`ts:id\`)

### GET /api/chat
Query parameters:
- \`collection_id\` or \`address\` (at least one required)
- \`limit\`: 1 to 200 (default 200)
- \`before\`: Keyset pagination cursor

### GET /api/message/:key
Fetch single message by numeric ID or 64-character txid.

---

## 5. Security & Privacy Philosophy

- **Non-Custodial**: The Permanent Record never requests private keys, runs no wallet software, and performs purely read-only on-chain indexing.
- **Anti-KYC / Cypherpunk**: No tracking cookies, no third-party telemetry, no surveillance scripts.
- **Proof-of-Work Anti-Spam**: Public likes and address suggestions require mining a 16-bit SHA-256 partial pre-image nonce, preventing bot floods without CAPTCHAs or KYC.
`;
}

// ---------------------------------------------------------------------------
// 3. XML Sitemap Builder
// ---------------------------------------------------------------------------

export interface SitemapMessage {
  txid: string;
  block_time: number | null;
  created_at: string;
}

export interface SitemapActivity {
  /** Categories with the newest row's unix time. */
  categories?: Array<{ category: string; last_ts?: number | null }>;
  /** Newest message time per monitored address. */
  addressActivity?: ReadonlyMap<string, number>;
  /** Fixed "today" for tests. */
  today?: string;
}

const dayOf = (ts: number | null | undefined): string | undefined => (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : undefined);

/**
 * lastmod is the page's real last activity wherever we know it (a crawler
 * that catches us stamping "today" on everything stops trusting the file).
 * Only the pages that genuinely change with every block keep today's date.
 */
export function generateSitemapXml(
  siteUrl: string,
  collections: CollectionWithStats[],
  addresses: Address[],
  topMessages: SitemapMessage[],
  protocols: Array<{ protocol: string; last_ts?: number | null }> = [],
  ticks: Array<{ tick: string; last_ts?: number | null }> = [],
  guides: Array<{ slug: string; updated: string }> = [],
  activity: SitemapActivity = {}
): string {
  const urls: Array<{ loc: string; lastmod?: string; changefreq: string; priority: string }> = [];

  const today = activity.today || new Date().toISOString().slice(0, 10);
  const addrLast = activity.addressActivity || new Map<string, number>();
  const colLast = new Map<number, number>();
  for (const a of addresses) {
    const t = addrLast.get(a.address);
    if (t && t > (colLast.get(a.collection_id) || 0)) colLast.set(a.collection_id, t);
  }
  const maxOf = (xs: Array<number | null | undefined>): number | undefined => xs.reduce<number | undefined>((m, x) => (x && (!m || x > m) ? x : m), undefined);
  const catLast = new Map((activity.categories || []).map((c) => [c.category, c.last_ts ?? undefined]));

  // Core pages
  urls.push({ loc: `${siteUrl}/`, lastmod: today, changefreq: 'hourly', priority: '1.0' });
  urls.push({ loc: `${siteUrl}/feed`, lastmod: today, changefreq: 'hourly', priority: '0.9' });
  urls.push({ loc: `${siteUrl}/collections`, lastmod: dayOf(maxOf([...colLast.values()])) || today, changefreq: 'daily', priority: '0.9' });
  const guidesLast = guides.length ? guides.reduce((m, g) => (g.updated > m ? g.updated : m), guides[0].updated) : undefined;
  urls.push({ loc: `${siteUrl}/guide`, lastmod: guidesLast, changefreq: 'monthly', priority: '0.8' });
  urls.push({ loc: `${siteUrl}/protocols`, lastmod: dayOf(maxOf(protocols.map((p) => p.last_ts))) || today, changefreq: 'hourly', priority: '0.9' });
  urls.push({ loc: `${siteUrl}/rooms`, lastmod: today, changefreq: 'hourly', priority: '0.8' });
  urls.push({ loc: `${siteUrl}/learn`, lastmod: guidesLast, changefreq: 'weekly', priority: '0.9' });
  for (const g of guides) urls.push({ loc: `${siteUrl}/learn/${g.slug}`, lastmod: g.updated, changefreq: 'weekly', priority: '0.8' });

  // Collections & Chat
  for (const col of collections) {
    const slug = col.slug || String(col.id);
    const lastmod = dayOf(colLast.get(col.id));
    urls.push({ loc: `${siteUrl}/c/${slug}`, lastmod, changefreq: 'daily', priority: '0.8' });
    urls.push({ loc: `${siteUrl}/c/${slug}/chat`, lastmod, changefreq: 'daily', priority: '0.8' });
  }

  // Categories (no lastmod for an empty category rather than a made-up date)
  for (const cat of CATEGORIES) {
    urls.push({ loc: `${siteUrl}/cat/${categorySlug(cat)}`, lastmod: dayOf(catLast.get(cat)), changefreq: 'daily', priority: '0.7' });
  }

  // Protocol & ticker pages (full-chain explorer)
  for (const p of protocols) {
    if (p.protocol === 'text') continue;
    urls.push({ loc: `${siteUrl}/p/${encodeURIComponent(p.protocol)}`, lastmod: dayOf(p.last_ts), changefreq: 'hourly', priority: '0.7' });
  }
  for (const t of ticks) {
    urls.push({ loc: `${siteUrl}/tick/${encodeURIComponent(t.tick)}`, lastmod: dayOf(t.last_ts), changefreq: 'daily', priority: '0.6' });
  }

  // Monitored Addresses & Chat
  for (const addr of addresses) {
    const lastmod = dayOf(addrLast.get(addr.address));
    urls.push({ loc: `${siteUrl}/a/${encodeURIComponent(addr.address)}`, lastmod, changefreq: 'daily', priority: '0.7' });
    urls.push({ loc: `${siteUrl}/a/${encodeURIComponent(addr.address)}/chat`, lastmod, changefreq: 'daily', priority: '0.7' });
  }

  // Top / Recent Messages
  for (const msg of topMessages) {
    const modDate = msg.block_time
      ? new Date(msg.block_time * 1000).toISOString().slice(0, 10)
      : msg.created_at.slice(0, 10);
    urls.push({
      loc: `${siteUrl}/m/${msg.txid}`,
      lastmod: modDate,
      changefreq: 'monthly',
      priority: '0.6',
    });
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const u of urls) {
    xml += '  <url>\n';
    xml += `    <loc>${escXml(u.loc)}</loc>\n`;
    if (u.lastmod) xml += `    <lastmod>${u.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${u.changefreq}</changefreq>\n`;
    xml += `    <priority>${u.priority}</priority>\n`;
    xml += '  </url>\n';
  }
  xml += '</urlset>\n';

  return xml;
}

// ---------------------------------------------------------------------------
// 4. RFC 9727 API Catalog & OpenAPI Specifications
// ---------------------------------------------------------------------------

export function generateApiCatalogJson(siteUrl: string): Record<string, unknown> {
  return {
    linkset: [
      {
        anchor: `${siteUrl}/api`,
        'service-desc': [
          {
            href: `${siteUrl}/api/openapi.json`,
            type: 'application/vnd.oai.openapi+json;version=3.0',
          },
        ],
        'service-doc': [
          {
            href: `${siteUrl}/llms.txt`,
            type: 'text/markdown',
          },
        ],
        status: [
          {
            href: `${siteUrl}/api/health`,
            type: 'application/json',
          },
        ],
      },
    ],
  };
}

export function generateOpenApiJson(siteUrl: string): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'The Permanent Record API',
      version: '1.0.0',
      description:
        'REST API for querying Bitcoin OP_RETURN messages, monitored addresses, curated collections, and classifications.',
    },
    servers: [{ url: siteUrl }],
    paths: {
      '/api/collections': {
        get: {
          summary: 'List monitored collections',
          operationId: 'listCollections',
          responses: {
            '200': {
              description: 'List of curated address collections with stats',
            },
          },
        },
      },
      '/api/messages': {
        get: {
          summary: 'Get archived OP_RETURN messages',
          operationId: 'getMessages',
          parameters: [
            { name: 'collection_id', in: 'query', schema: { type: 'integer' } },
            { name: 'address', in: 'query', schema: { type: 'string' } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'protocol', in: 'query', schema: { type: 'string' }, description: 'Protocol slug, e.g. ico-20, thorchain, omni' },
            { name: 'tick', in: 'query', schema: { type: 'string' }, description: 'Token ticker, e.g. LEAF' },
            {
              name: 'kind',
              in: 'query',
              schema: { type: 'string', enum: ['text', 'all'] },
              description: 'text = human messages only (default for the global feed); all = every stored protocol',
            },
            {
              name: 'sort',
              in: 'query',
              schema: { type: 'string', enum: ['hot', 'new'], default: 'new' },
            },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'before', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Messages feed with pagination cursor',
            },
          },
        },
      },
      '/api/protocols': {
        get: {
          summary: 'Distinct transactions per OP_RETURN protocol',
          operationId: 'listProtocols',
          parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 0 }, description: '0 = all time; else 1/7/30/90/365' }],
          responses: { '200': { description: 'Protocol slugs with counts and labels' } },
        },
      },
      '/api/ticks': {
        get: {
          summary: 'Token tickers by activity',
          operationId: 'listTicks',
          parameters: [
            { name: 'protocol', in: 'query', schema: { type: 'string' } },
            { name: 'days', in: 'query', schema: { type: 'integer', default: 0 }, description: '0 = all time' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
          ],
          responses: { '200': { description: 'Tickers with protocol and counts' } },
        },
      },
      '/api/chain': {
        get: {
          summary: 'Block census for the full-chain scanner',
          operationId: 'getChain',
          responses: { '200': { description: 'Blocks scanned, OP_RETURN / Runes / binary counts, recent blocks' } },
        },
      },
      '/api/block/{height}': {
        get: {
          summary: 'OP_RETURN census of one scanned block',
          operationId: 'getBlock',
          parameters: [{ name: 'height', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { '200': { description: 'Block row' }, '404': { description: 'Block not scanned' } },
        },
      },
      '/api/chat': {
        get: {
          summary: 'Get chronological conversation',
          operationId: 'getChat',
          parameters: [
            { name: 'collection_id', in: 'query', schema: { type: 'integer' } },
            { name: 'address', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 200 } },
          ],
          responses: {
            '200': {
              description: 'Messages and participants in chronological order',
            },
          },
        },
      },
      '/api/categories': {
        get: {
          summary: 'Get category classification stats',
          operationId: 'listCategories',
          responses: {
            '200': { description: 'Categories with message counts' },
          },
        },
      },
      '/api/message/{key}': {
        get: {
          summary: 'Get message by ID or txid',
          operationId: 'getMessage',
          parameters: [
            { name: 'key', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Single message details' },
            '404': { description: 'Message not found' },
          },
        },
      },
      '/api/like': {
        post: {
          summary: 'Upvote a message with Proof-of-Work nonce',
          operationId: 'likeMessage',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer', description: 'Message ID' },
                    nonce: { type: 'string', description: 'Hex nonce giving sha256(id:nonce) 16 leading zero bits' },
                  },
                  required: ['id', 'nonce'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Updated like count' },
            '400': { description: 'Invalid Proof-of-Work nonce or expired challenge' },
          },
        },
      },
      '/api/health': {
        get: {
          summary: 'Service health check',
          operationId: 'getHealth',
          responses: {
            '200': { description: 'OK status with server time' },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Auth.md & OAuth / OIDC Discovery Standards
// ---------------------------------------------------------------------------

export function generateAuthMd(siteUrl: string): string {
  return `# auth.md

> Machine-readable agent registration, discovery, and authorization specification for The Permanent Record (opreturn.xyz).
> Public immutable Bitcoin blockchain index. Unauthenticated anonymous access is supported.

## Agent registration

The Permanent Record indexes public, immutable Bitcoin blockchain data.
- **Agent Audience**: Autonomous AI agents, LLM tool executors, indexers, and automated scrapers.
- **Read Access**: Completely anonymous and unauthenticated. AI agents can query all public APIs (/api/messages, /api/collections, /api/chat, /mcp) without registration or API keys.
- **Rate Limits**: Governed by Cloudflare edge protection with high-availability SWR caching. Standard User-Agent identifiers receive maximum throughput.
- **Write Actions**: Rate-limited and anti-spam protected using a client-mined 16-bit Proof-of-Work nonce (sha256(id:nonce) having 16 leading zero bits). No KYC or centralized account required.

Both roles live on one host. The resource server is ${siteUrl} and the authorization server is ${siteUrl}.

## Discovery

Read these two documents in this order:

- Fetch ${siteUrl}/.well-known/oauth-protected-resource and read resource, resource_name, authorization_servers, scopes_supported, bearer_methods_supported, and agent_auth.
- Fetch ${siteUrl}/.well-known/oauth-authorization-server and read the agent_auth block: skill, register_uri, claim_uri, revocation_uri, identity_types_supported, anonymous.credential_types_supported, and identity_assertion.assertion_types_supported.

There is no WWW-Authenticate challenge. Every resource is public and answers anonymous requests directly. OAuth metadata is published so agents can register or claim identities without guessing.

## Scopes

- read:messages — Read immutable Bitcoin OP_RETURN messages, mempool feeds, and broadcasts.
- read:collections — Read curated Bitcoin address collections and multi-party chat feeds.

## Endpoints

- Registration Endpoint: ${siteUrl}/oauth/register
- Token Endpoint: ${siteUrl}/oauth/token
- Claim URI: ${siteUrl}/oauth/claim
- Revocation URI: ${siteUrl}/oauth/revoke

## Supported identity types

### 1. Anonymous Access (Recommended)
- Identity Type: anonymous
- Credential Types Supported: bearer_token, api_key
- Registration URI: ${siteUrl}/oauth/register
- Claim URI: ${siteUrl}/oauth/claim
- Scopes: read:messages, read:collections

### 2. ID-JAG Identity Assertion
- Identity Type: identity_assertion
- Assertion Types Supported: urn:ietf:params:oauth:token-type:id-jag
- Credential Types Supported: bearer_token, api_key
- Registration URI: ${siteUrl}/oauth/register
- Revocation URI: ${siteUrl}/oauth/revoke

### 3. Verified Email Assertion
- Identity Type: identity_assertion
- Assertion Types Supported: verified_email
- Credential Types Supported: bearer_token, api_key
- Registration URI: ${siteUrl}/oauth/register
- Claim URI: ${siteUrl}/oauth/claim

## Standalone registration flow

Agents can register anonymously or assert identity via standard HTTP requests:

\`\`\`http
POST /oauth/register HTTP/1.1
Host: opreturn.xyz
Content-Type: application/json

{
  "client_name": "Autonomous Agent",
  "grant_types": ["anonymous"],
  "identity_type": "anonymous"
}
\`\`\`

Response:
\`\`\`json
{
  "client_id": "anonymous-agent",
  "access_token": "opreturn_anonymous_read_token",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "read:messages read:collections"
}
\`\`\`

To claim ownership of an identifier or verify operator correspondence:
\`\`\`http
POST /oauth/claim HTTP/1.1
Host: opreturn.xyz
Authorization: Bearer <token>
Content-Type: application/json

{
  "claim_type": "verified_email",
  "email": "agent@example.com"
}
\`\`\`

To revoke issued agent credentials:
\`\`\`http
POST /oauth/revoke HTTP/1.1
Host: opreturn.xyz
Content-Type: application/json

{
  "token": "<token>"
}
\`\`\`

## Credential usage

For unauthenticated operations, simply execute standard HTTP GET requests. For authenticated sessions, pass the bearer token via the standard Authorization header:

\`\`\`http
GET /api/messages HTTP/1.1
Host: opreturn.xyz
Authorization: Bearer <token>
Accept: application/json
\`\`\`
`;
}

export function generateOAuthProtectedResourceJson(siteUrl: string): Record<string, unknown> {
  return {
    resource: siteUrl,
    resource_name: 'The Permanent Record',
    authorization_servers: [siteUrl],
    scopes_supported: ['read:messages', 'read:collections'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${siteUrl}/auth.md`,
    agent_auth: {
      skill: `${siteUrl}/auth.md`,
      documentation_uri: `${siteUrl}/auth.md`,
      register_uri: `${siteUrl}/oauth/register`,
      claim_uri: `${siteUrl}/oauth/claim`,
      revocation_uri: `${siteUrl}/oauth/revoke`,
      identity_types_supported: ['anonymous', 'identity_assertion'],
      anonymous: {
        credential_types_supported: ['bearer_token', 'api_key'],
        claim_uri: `${siteUrl}/oauth/claim`,
      },
      identity_assertion: {
        assertion_types_supported: [
          'urn:ietf:params:oauth:token-type:id-jag',
          'verified_email',
        ],
        credential_types_supported: ['bearer_token', 'api_key'],
        claim_uri: `${siteUrl}/oauth/claim`,
        revocation_uri: `${siteUrl}/oauth/revoke`,
      },
      supported_identity_types: ['anonymous', 'identity_assertion'],
    },
  };
}

export function generateOAuthServerJson(siteUrl: string): Record<string, unknown> {
  return {
    issuer: siteUrl,
    authorization_endpoint: `${siteUrl}/oauth/authorize`,
    token_endpoint: `${siteUrl}/oauth/token`,
    jwks_uri: `${siteUrl}/.well-known/jwks.json`,
    registration_endpoint: `${siteUrl}/oauth/register`,
    revocation_endpoint: `${siteUrl}/oauth/revoke`,
    claim_endpoint: `${siteUrl}/oauth/claim`,
    scopes_supported: ['read:messages', 'read:collections'],
    response_types_supported: ['token', 'code'],
    grant_types_supported: ['client_credentials', 'anonymous', 'authorization_code'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    events_supported: ['urn:ietf:params:oauth:event:token-revoked'],
    service_documentation: `${siteUrl}/auth.md`,
    protected_resources: [siteUrl],
    agent_auth: {
      skill: `${siteUrl}/auth.md`,
      documentation_uri: `${siteUrl}/auth.md`,
      register_uri: `${siteUrl}/oauth/register`,
      claim_uri: `${siteUrl}/oauth/claim`,
      revocation_uri: `${siteUrl}/oauth/revoke`,
      identity_types_supported: ['anonymous', 'identity_assertion'],
      anonymous: {
        credential_types_supported: ['bearer_token', 'api_key'],
        claim_uri: `${siteUrl}/oauth/claim`,
      },
      identity_assertion: {
        assertion_types_supported: [
          'urn:ietf:params:oauth:token-type:id-jag',
          'verified_email',
        ],
        credential_types_supported: ['bearer_token', 'api_key'],
        claim_uri: `${siteUrl}/oauth/claim`,
        revocation_uri: `${siteUrl}/oauth/revoke`,
      },
      supported_identity_types: ['anonymous', 'identity_assertion'],
    },
  };
}

// ---------------------------------------------------------------------------
// 6. A2A Protocol Agent Card & MCP Server Card
// ---------------------------------------------------------------------------

export function generateAgentCardJson(siteUrl: string): Record<string, unknown> {
  return {
    $schema: 'https://a2a-protocol.org/latest/schema/agent-card.json',
    protocolVersion: 'a2a-v1',
    name: 'The Permanent Record',
    version: '1.0.0',
    description:
      'Live monitor and immutable archive for arbitrary data and messages etched inside the Bitcoin blockchain via OP_RETURN outputs.',
    supportedInterfaces: [
      {
        url: `${siteUrl}/api`,
        protocol: 'http/json',
        version: '1.0',
      },
      {
        url: `${siteUrl}/mcp`,
        protocol: 'mcp',
        version: '2024-11-05',
      },
    ],
    capabilities: {
      streaming: false,
      stateTransition: false,
      proofOfWork: true,
    },
    skills: [
      {
        id: 'search-opreturn',
        name: 'Search OP_RETURN Messages',
        description: 'Query live on-chain Bitcoin OP_RETURN messages filtered by address, collection, or category.',
      },
      {
        id: 'get-collections',
        name: 'Get Collections Directory',
        description: 'Retrieve curated Bitcoin address collections (Bitget hack, Liquid Network whitehat, Coldcard exploit, Mt. Gox 1Feex, Genesis tributes).',
      },
      {
        id: 'get-chat-stream',
        name: 'Get On-Chain Conversation',
        description: 'Retrieve chronological on-chain conversation bubbles between monitored addresses and correspondents.',
      },
      {
        id: 'etch-guide',
        name: 'Bitcoin Etch Field Manual',
        description: 'Get technical instructions and CLI commands to attach an OP_RETURN message to a Bitcoin transaction.',
      },
    ],
  };
}

export function generateMcpServerCardJson(siteUrl: string): Record<string, unknown> {
  return {
    serverInfo: {
      name: 'opreturn-monitor',
      version: '1.0.0',
      description: 'Model Context Protocol (MCP) server for Bitcoin OP_RETURN messages and collections.',
    },
    endpoint: `${siteUrl}/mcp`,
    capabilities: {
      tools: {
        listChanged: false,
      },
      resources: {
        subscribe: false,
        listChanged: false,
      },
      prompts: {
        listChanged: false,
      },
    },
    tools: [
      {
        name: 'search_messages',
        description:
          'Search Bitcoin OP_RETURN transactions by collection, address, category, protocol (ico-20, crc-20, thorchain, omni, ...) or token ticker. Defaults to human-readable messages; kind=all includes every decoded protocol.',
        inputSchema: {
          type: 'object',
          properties: {
            collection_id: { type: 'number', description: 'Collection ID filter' },
            address: { type: 'string', description: 'Bitcoin address filter (filed-under, recipient or sender)' },
            category: { type: 'string', description: 'Category slug' },
            protocol: { type: 'string', description: 'Protocol slug, e.g. ico-20, thorchain, omni' },
            tick: { type: 'string', description: 'Token ticker, e.g. LEAF' },
            kind: { type: 'string', enum: ['text', 'all'], description: 'text = human messages only; all = every protocol' },
            sort: { type: 'string', enum: ['hot', 'new'], default: 'hot' },
            limit: { type: 'number', default: 20 },
          },
        },
      },
      {
        name: 'get_protocols',
        description: 'Protocol census across every scanned block: transactions per OP_RETURN protocol, most active token tickers, and block-scanner statistics (Runes share etc.)',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_block',
        description: 'OP_RETURN census of one scanned block plus its stored transactions',
        inputSchema: {
          type: 'object',
          properties: { height: { type: 'number', description: 'Block height' } },
          required: ['height'],
        },
      },
      {
        name: 'get_collections',
        description: 'List all monitored Bitcoin collections (Bitget hack, Liquid Network whitehats, Coldcard exploit, Mt Gox, Genesis)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_message',
        description: 'Get an on-chain message by transaction ID or message ID',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Transaction ID or message ID' },
          },
          required: ['key'],
        },
      },
      {
        name: 'list_guides',
        description: 'List the Learn guides (long-form explainers on OP_RETURN, Core 30 policy, incident boards, etching, the API) with slugs and descriptions',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_guide',
        description: 'Get one Learn guide as Markdown with live numbers resolved',
        inputSchema: { type: 'object', properties: { slug: { type: 'string', description: 'Guide slug from list_guides' } }, required: ['slug'] },
      },
      {
        name: 'get_etch_guide',
        description: 'Get the technical guide for constructing an OP_RETURN Bitcoin transaction',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 6b. Agent Skills Discovery Standard (agentskills.io)
// ---------------------------------------------------------------------------

export function generateAgentSkillsIndexJson(siteUrl: string): Record<string, unknown> {
  return {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [
      {
        name: 'bitcoin-opreturn-monitor',
        type: 'skill-md',
        description: 'Query, search, and verify immutable Bitcoin OP_RETURN on-chain transmissions and monitored addresses.',
        url: `${siteUrl}/.well-known/agent-skills/bitcoin-opreturn-monitor/SKILL.md`,
      },
      {
        name: 'etch-opreturn-guide',
        type: 'skill-md',
        description: 'Step-by-step instructions for constructing, signing, and broadcasting OP_RETURN outputs to the Bitcoin blockchain.',
        url: `${siteUrl}/.well-known/agent-skills/etch-opreturn-guide/SKILL.md`,
      },
      {
        name: 'auth-md-registration',
        type: 'skill-md',
        description: 'Autonomous AI agent authentication, discovery, and registration protocol support.',
        url: `${siteUrl}/.well-known/agent-skills/auth-md-registration/SKILL.md`,
      },
    ],
  };
}

export function generateSkillMd(skillName: string, siteUrl: string): string {
  if (skillName === 'bitcoin-opreturn-monitor') {
    return `# Skill: Bitcoin OP_RETURN Monitor

## What This Skill Does
Allows autonomous AI agents to query, search, and monitor live, permanent messages etched into the Bitcoin blockchain via OP_RETURN outputs.

## Requirements
- Query messages via \`GET ${siteUrl}/api/messages\` (supports \`sort=hot\` or \`sort=new\`, \`collection_id\`, \`category\`, \`limit\`).
- Fetch specific message detail via \`GET ${siteUrl}/api/message/:txid\`.
- Fetch curated monitored collections via \`GET ${siteUrl}/api/collections\`.
- Use Model Context Protocol (MCP) tool \`search_messages\` or \`get_message_detail\`.
`;
  }
  if (skillName === 'etch-opreturn-guide') {
    return `# Skill: Etch OP_RETURN On Bitcoin

## What This Skill Does
Guides autonomous agents and operators through building, signing, and broadcasting Bitcoin transactions carrying immutable data outputs.

## Requirements
- Format data payload as UTF-8 hex string.
- Create provably unspendable OP_RETURN output using \`bitcoin-cli\` or wallet console.
- Attach required fee rate and broadcast to Bitcoin mempool.
`;
  }
  return `# Skill: Auth.md Agent Registration

## What This Skill Does
Enables autonomous agent registration, discovery, and credential claiming per the Auth.md open protocol.

## Requirements
- Read discovery metadata at \`${siteUrl}/auth.md\` and \`${siteUrl}/.well-known/oauth-protected-resource\`.
- Register anonymously via \`POST ${siteUrl}/oauth/register\`.
- Claim operator correspondence via \`POST ${siteUrl}/oauth/claim\`.
`;
}

// ---------------------------------------------------------------------------
// 7. Schema.org JSON-LD Structured Data Builders
// ---------------------------------------------------------------------------

export const FAQ_ITEMS = [
  {
    q: 'What is an OP_RETURN message in Bitcoin?',
    a: 'An OP_RETURN output uses Bitcoin Script opcode 0x6a to mark an output as provably unspendable while carrying arbitrary data, which nodes drop from the UTXO set immediately. Full guide: /learn/what-is-op-return',
  },
  {
    q: 'Can an OP_RETURN message be deleted, altered, or censored?',
    a: 'No. Once the transaction is confirmed, the data is part of a block secured by proof of work; changing it would mean re-mining that block and every block after it. Full guide: /learn/what-is-op-return',
  },
  {
    q: 'How much data can fit inside an OP_RETURN output?',
    a: 'Consensus sets no specific limit. ' + CORE30.summary + ' Full guide: /learn/bitcoin-core-30-op-return-datacarriersize',
  },
  {
    q: 'What does The Permanent Record archive?',
    a: 'Every block is scanned and every OP_RETURN output is decoded: human messages, token protocols such as ico-20 and crc-20, bridge and sidechain markers, inline files. Curated collections follow high-profile addresses that turned into public bulletin boards: whitehat and hacker negotiations, dormant-wallet notices, Genesis block tributes.',
  },
  {
    q: 'How does AI classification categorize transmissions?',
    a: `Each message is decoded to UTF-8 and processed through an OpenAI-compatible endpoint that classifies content into one of ${CATEGORIES.length} categories: ${CATEGORIES.filter((c) => c !== 'Other').join(', ')}, or Other.`,
  },
  {
    q: 'How can I etch my own message into Bitcoin?',
    a: 'Attach an OP_RETURN output with Bitcoin Core (a data output in createrawtransaction) or Electrum (OP_RETURN <hex> in the Send tab), pay a normal miner fee, and broadcast. Sparrow Wallet has no native field yet. Step by step: the Field Manual at /guide and the guide at /learn/how-to-etch-op-return.',
  },
];

export function buildWebSiteGraph(siteUrl: string): Record<string, unknown>[] {
  return [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: `${siteUrl}/`,
      name: 'The Permanent Record',
      alternateName: ['opreturn.xyz', 'Bitcoin OP_RETURN Monitor'],
      description: 'Real-time archive and monitor for messages etched inside the Bitcoin blockchain via OP_RETURN.',
      inLanguage: 'en',
      publisher: {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'The Permanent Record',
        url: siteUrl,
        logo: `${siteUrl}/icon-512.png`,
      },
    },
    {
      '@type': 'WebApplication',
      '@id': `${siteUrl}/#app`,
      name: 'The Permanent Record',
      url: `${siteUrl}/`,
      applicationCategory: 'BlockchainApplication',
      operatingSystem: 'All',
      description: 'Decentralized on-chain message monitor and archive for Bitcoin OP_RETURN outputs.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
  ];
}

export function buildFaqSchema(): Record<string, unknown> {
  return {
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

export function buildGuideHowToSchema(siteUrl: string): Record<string, unknown> {
  return {
    '@type': 'HowTo',
    '@id': `${siteUrl}/guide#howto`,
    name: 'How to etch a permanent message onto the Bitcoin blockchain',
    description: 'Step-by-step guide to embedding arbitrary data into Bitcoin using OP_RETURN outputs.',
    totalTime: 'PT5M',
    tool: [
      { '@type': 'HowToTool', name: 'Sparrow Wallet' },
      { '@type': 'HowToTool', name: 'Bitcoin Core CLI' },
      { '@type': 'HowToTool', name: 'Electrum' },
    ],
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Understand the tradeoff',
        text: 'OP_RETURN attaches data to a provably-unspendable output. ' + CORE30.short + ' Larger data pays higher miner fees. The message is immutable once confirmed.',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Use a wallet that supports OP_RETURN',
        text: 'Use Bitcoin Core (bitcoin-cli) or Electrum, which accept an OP_RETURN output directly; Sparrow Wallet can sign a PSBT built elsewhere but has no native OP_RETURN field yet. Custodial exchanges do not support arbitrary data outputs.',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Write and encode your message',
        text: 'Draft your message in UTF-8 text and convert it to hexadecimal representation.',
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'Build the transaction',
        text: 'Construct the raw transaction with an OP_RETURN output carrying your hex data, 0 sats output value, and a change output back to your wallet.',
      },
      {
        '@type': 'HowToStep',
        position: 5,
        name: 'Broadcast and verify',
        text: 'Sign and broadcast the transaction to the Bitcoin mempool. Once confirmed in a block, it remains on the blockchain forever.',
      },
    ],
  };
}

export function buildBreadcrumbSchema(
  siteUrl: string,
  items: Array<{ name: string; path: string }>
): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`,
    })),
  };
}

export function buildMessageSchema(
  siteUrl: string,
  msg: Message,
  colName?: string
): Record<string, unknown> {
  return {
    '@type': 'SocialMediaPosting',
    '@id': `${siteUrl}/m/${msg.txid}#post`,
    headline: msg.content ? `\u201c${stripDataUris(msg.content).slice(0, 100)}\u201d` : 'Bitcoin OP_RETURN transmission',
    articleBody: stripDataUris(msg.content),
    datePublished: msg.block_time
      ? new Date(msg.block_time * 1000).toISOString()
      : new Date(msg.created_at).toISOString(),
    identifier: msg.txid,
    author: {
      '@type': 'Person',
      name: msg.sender ? shortAddr(msg.sender) : shortAddr(msg.address),
      url: `https://mempool.space/address/${msg.sender || msg.address}`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'The Permanent Record',
      url: siteUrl,
    },
    isPartOf: {
      '@type': 'CollectionPage',
      name: colName || 'Bitcoin OP_RETURN transmissions',
      url: `${siteUrl}/collections`,
    },
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/LikeAction',
      userInteractionCount: msg.likes,
    },
  };
}

export function buildCollectionSchema(
  siteUrl: string,
  col: CollectionWithStats
): Record<string, unknown> {
  return {
    '@type': 'CollectionPage',
    '@id': `${siteUrl}/c/${col.slug || col.id}#collection`,
    name: col.name,
    description: col.description || '',
    url: `${siteUrl}/c/${col.slug || col.id}`,
    isPartOf: {
      '@type': 'WebSite',
      url: siteUrl,
    },
  };
}

// ---------------------------------------------------------------------------
// 8. Markdown Representation Generators (Content Negotiation: text/markdown)
// ---------------------------------------------------------------------------

export function renderLandingMarkdown(
  siteUrl: string,
  collectionsCount: number,
  addressesCount: number,
  featuredMsg?: Message | null,
  colName?: string
): string {
  let md = `# The Permanent Record — Bitcoin OP_RETURN Monitor\n\n`;
  md += `> People are leaving messages inside Bitcoin. Forever. Threats, confessions, prayers, ads, haiku — archived live from the blockchain.\n\n`;
  md += `## Live Metrics\n`;
  md += `- **Collections Tracked**: ${collectionsCount}\n`;
  md += `- **Addresses Monitored**: ${addressesCount}\n`;
  md += `- **Polling Frequency**: ~3 minutes\n`;
  md += `- **Immutability**: Permanent / Proof-of-Work committed\n\n`;

  if (featuredMsg) {
    md += `## Transmission of the Day\n`;
    md += `> \u201c${featuredMsg.content || ''}\u201d\n\n`;
    md += `- **Collection**: ${colName || 'Monitored address'}\n`;
    md += `- **Address**: \`${featuredMsg.address}\`\n`;
    md += `- **Transaction**: [${featuredMsg.txid}](https://mempool.space/tx/${featuredMsg.txid})\n`;
    md += `- **Likes**: ${featuredMsg.likes}\n`;
    md += `- **Artifact Link**: ${siteUrl}/m/${featuredMsg.txid}\n\n`;
  }

  md += `## Frequently Asked Questions\n\n`;
  for (const item of FAQ_ITEMS) {
    md += `### ${item.q}\n${item.a}\n\n`;
  }

  md += `## Navigation & Links\n`;
  md += `- [Feed](${siteUrl}/feed)\n`;
  md += `- [Collections](${siteUrl}/collections)\n`;
  md += `- [Field Manual](${siteUrl}/guide)\n`;
  md += `- [API Documentation](${siteUrl}/llms.txt)\n`;
  return md;
}

export function renderGuideMarkdown(siteUrl: string): string {
  return `# Field Manual — Etch a Message onto Bitcoin
URL: ${siteUrl}/guide

An OP_RETURN output lets you attach arbitrary binary or UTF-8 data to a Bitcoin transaction.
Miners record it in the blockchain like any other transaction — meaning once confirmed, it is permanent and public.

## Caution Before You Begin
There is no undo. Anything you write is public forever, tied to your transaction, and costs a miner fee. Never include private keys, passwords, or illegal content.

## Steps to Etch

### 1. Understand the Tradeoff
OP_RETURN attaches data to a provably-unspendable output. ${CORE30.short}

### 2. Use a Wallet that Supports OP_RETURN
- **Sparrow Wallet**: no native OP_RETURN field yet (${SPARROW.issueUrl}); sign a PSBT built with Core or a script library
- **Bitcoin Core**: \`bitcoin-cli createrawtransaction\`
- **Electrum**: Console tab

### 3. Constructing with Bitcoin Core CLI
\`\`\`bash
DATA=$(printf 'gm, permanent record' | xxd -p -c 999)
bitcoin-cli -named createrawtransaction \\
  inputs='[{"txid":"<your-utxo>","vout":0}]' \\
  outputs='[{"data":"'$DATA'"},{"<change-addr>":0.0009}]'
bitcoin-cli signrawtransactionwithwallet "<raw-tx-hex>"
bitcoin-cli sendrawtransaction "<signed-hex>"
\`\`\`

### 4. Broadcast and Confirm
Once your transaction confirms in a block, it lives on-chain forever.
`;
}

export function renderCollectionsMarkdown(
  siteUrl: string,
  collections: CollectionWithStats[]
): string {
  let md = `# Collections Directory — The Permanent Record\n\n`;
  md += `Addresses grouped by the phenomenon behind them.\n\n`;
  for (const c of collections) {
    const slug = c.slug || String(c.id);
    md += `### [${c.name}](${siteUrl}/c/${slug})\n`;
    md += `${c.description || 'No description'}\n\n`;
    md += `- Monitored Addresses: ${c.address_count || 0}\n`;
    md += `- Archived Messages: ${c.message_count || 0}\n`;
    md += `- Chat Room: ${siteUrl}/c/${slug}/chat\n\n`;
  }
  return md;
}

export function renderCollectionMarkdown(
  siteUrl: string,
  col: CollectionWithStats,
  addresses: Address[]
): string {
  const slug = col.slug || String(col.id);
  let md = `# Collection: ${col.name}\n\n`;
  md += `${col.description || ''}\n\n`;
  md += `- Addresses: ${col.address_count}\n`;
  md += `- Messages: ${col.message_count}\n`;
  md += `- Chat View: ${siteUrl}/c/${slug}/chat\n\n`;

  if (addresses.length) {
    md += `## Monitored Addresses\n`;
    for (const a of addresses) {
      md += `- \`${a.address}\`${a.label ? ` — *${a.label}*` : ''}\n`;
    }
    md += '\n';
  }
  return md;
}

export function renderMessageMarkdown(
  siteUrl: string,
  msg: Message,
  colName?: string
): string {
  let md = `# Bitcoin OP_RETURN Artifact\n\n`;
  md += `> \u201c${msg.content || 'OP_RETURN'}\u201d\n\n`;
  if (colName) md += `- **Collection**: ${colName}\n`;
  md += `- **Address**: \`${msg.address}\`\n`;
  md += `- **Transaction**: [${msg.txid}](https://mempool.space/tx/${msg.txid})\n`;
  md += `- **Status**: ${msg.is_mempool ? 'In Mempool' : 'Confirmed'}\n`;
  md += `- **Likes**: ${msg.likes}\n`;
  if (msg.category) md += `- **Category**: ${msg.category}\n`;
  md += `- **Permanent URL**: ${siteUrl}/m/${msg.txid}\n`;
  return md;
}

export function renderAddressMarkdown(siteUrl: string, address: string): string {
  let md = `# Bitcoin Address Record: ${address}\n\n`;
  md += `Every archived OP_RETURN message sent to \`${address}\`.\n\n`;
  md += `- [View on mempool.space](https://mempool.space/address/${address})\n`;
  md += `- [View Chat Stream](${siteUrl}/a/${encodeURIComponent(address)}/chat)\n`;
  return md;
}

export function renderCategoryMarkdown(
  siteUrl: string,
  categoryName: string,
  count: number
): string {
  let md = `# Category: ${categoryName}\n\n`;
  md += `${count} archived Bitcoin OP_RETURN messages classified under this taxonomy.\n\n`;
  md += `- [Browse Feed](${siteUrl}/feed)\n`;
  return md;
}

export function renderFeedMarkdown(siteUrl: string): string {
  return `# All Transmissions — The Permanent Record\n\nHuman messages from every block of the Bitcoin chain, plus decoded token, bridge and sidechain protocols.\n\n- [Collections](${siteUrl}/collections)\n- [Field Manual](${siteUrl}/guide)\n- [API Specification](${siteUrl}/llms.txt)\n- Feed API: ${siteUrl}/api/messages?kind=all\n`;
}

// ---------------------------------------------------------------------------
// 9. Server-Side Rendering (SSR) Pre-rendered HTML for <main id="app">
// ---------------------------------------------------------------------------

export interface LandingData {
  collectionsCount: number;
  addressesCount: number;
  /** Sum of collection message counts; the pill fallback when the chain census is empty. */
  messagesCount: number;
  featured?: Message | null;
  colName?: string;
  live: Message[];
  chain: ChainStats | null;
  protocolsCount: number;
  categories: CategoryStat[];
}

/** "4m ago" style relative time from a unix timestamp or SQL datetime; mirrors the client helper. */
export function timeAgo(ts: number | string | null | undefined, now = Date.now()): string {
  if (ts == null || ts === '') return '';
  const ms = typeof ts === 'number' ? ts * 1000 : new Date(String(ts).replace(' ', 'T') + (String(ts).includes('Z') ? '' : 'Z')).getTime();
  if (Number.isNaN(ms)) return '';
  const diff = (now - ms) / 60000;
  if (diff < 1) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

const fmtN = (n: number) => Number(n || 0).toLocaleString('en-US');
const msgTime = (m: Message) => (m.block_time != null ? m.block_time : m.created_at);

/**
 * The landing page, in the same markup the client's renderAbout() builds, so
 * the script's first render is a no-op instead of a layout shift. The client
 * keeps this DOM (data-ssr="about") until the reader interacts with it.
 */
export function renderLandingSsr(d: LandingData): string {
  const ch = d.chain;
  let h = '<main data-ssr="about"><div class="hero"><div class="l">';
  h += `<span class="pill-live"><span class="d"></span>${ch && ch.stored_txs ? `${fmtN(ch.stored_txs)} OP_RETURN TXS DECODED` : `${fmtN(d.messagesCount)} MESSAGES ARCHIVED`} · UPDATING EVERY BLOCK</span>`;
  h += '<h1>People are leaving messages inside Bitcoin. Forever.</h1>';
  h += '<p class="lede">Every one of these was etched into an OP_RETURN output on the blockchain — threats, confessions, prayers, ads, haiku. Immutable. Unstoppable. We scan every block, decode every OP_RETURN protocol, and keep the human messages front and centre.</p>';
  h += '<div class="cta"><a class="btn btn-primary" href="/feed">Enter the feed →</a><a class="btn" href="/guide">Etch your own</a><a class="btn" href="/learn">Read the guides</a></div></div>';
  h += '<div class="livepanel"><span class="h">● LIVE FROM THE CHAIN</span>';
  if (!d.live.length) h += '<a href="/feed"><span class="k">waiting for the next block</span><span class="c">The feed fills in as blocks arrive.</span></a>';
  for (const m of d.live) {
    const t = msgTime(m);
    h += `<a href="/m/${escHtml(m.txid)}" data-ts="${escHtml(String(t ?? ''))}" data-k="${escHtml(m.category || 'message')}"><span class="k">${escHtml(m.category || 'message')} · ${escHtml(timeAgo(t))}</span><span class="c">${escHtml(messageExcerpt(m, 200))}</span></a>`;
  }
  h += '</div></div>';

  h += '<div class="about-sec"><div class="stats">';
  if (ch && ch.blocks) {
    const pct = ch.opreturn_outputs ? Math.round((ch.runes_outputs / ch.opreturn_outputs) * 100) : 0;
    h += `<div class="stat"><span class="v">${fmtN(ch.blocks)}</span><span class="l">Blocks scanned</span></div>`;
    h += `<div class="stat"><span class="v">${fmtN(ch.opreturn_outputs)}</span><span class="l">OP_RETURN outputs seen</span></div>`;
    h += `<div class="stat"><span class="v">${pct}%</span><span class="l">Runes (counted, not shown)</span></div>`;
    h += `<a class="stat" href="/protocols"><span class="v">${d.protocolsCount}</span><span class="l">Protocols decoded →</span></a>`;
  } else {
    h += `<div class="stat"><span class="v">${d.collectionsCount}</span><span class="l">Collections tracked</span></div>`;
    h += `<div class="stat"><span class="v">${fmtN(d.addressesCount)}</span><span class="l">Addresses monitored</span></div>`;
    h += '<div class="stat"><span class="v">~3min</span><span class="l">Fresh every poll</span></div>';
    h += '<div class="stat"><span class="v">∞</span><span class="l">Years it stays online</span></div>';
  }
  h += '</div><div class="about-grid">';
  const feat = d.featured;
  if (feat) {
    h += `<a class="featured" href="/m/${escHtml(feat.txid)}"><span class="k">◆ TRANSMISSION OF THE DAY</span><blockquote>“${escHtml(messageExcerpt(feat, 400))}”</blockquote>`;
    h += `<span class="m"><span>↳ ${escHtml(d.colName || shortAddr(feat.address))}</span><span>${escHtml(timeAgo(msgTime(feat)))}</span><span style="color:var(--sig)">♥ ${fmtN(feat.likes || 0)}</span></span></a>`;
  }
  if (d.categories.length) {
    const tot = d.categories.reduce((t, c) => t + (c.count || 0), 0) || 1;
    h += '<div class="chart"><span class="slabel">WHAT THEY’RE SAYING · BY CATEGORY</span>';
    for (const c of d.categories) {
      const p = Math.round((c.count / tot) * 100);
      h += `<a class="mix" href="/cat/${encodeURIComponent(categorySlug(c.category))}"><div class="t"><span>${escHtml(c.category)}</span><span>${p}%</span></div><div class="bar"><i class="${HOSTILE_CATEGORIES.has(c.category) ? 'sig' : ''}" style="width:${p}%"></i></div></a>`;
    }
    h += '</div>';
  }
  h += '</div></div>';

  h += '<div class="about-sec"><span class="kicker">◆ FAQ</span><div class="faq">';
  FAQ_ITEMS.forEach((item, i) => {
    const open = i === 0;
    h += `<button class="faq-item${open ? ' open' : ''}" data-action="faq-toggle" data-i="${i}"><span class="faq-q"><span>${escHtml(item.q)}</span><span class="sign">${open ? '−' : '+'}</span></span><span class="faq-a">${escHtml(item.a)}</span></button>`;
  });
  h += '</div></div></main>';
  return h;
}

export function renderGuideSsr(): string {
  const code = [
    "# Bitcoin Core — attach arbitrary data (80+ bytes now relay by default)",
    "DATA=$(printf 'gm, permanent record' | xxd -p -c 999)",
    "bitcoin-cli -named createrawtransaction \\",
    '  inputs=\'[{"txid":"<your-utxo>","vout":0}]\' \\',
    "  outputs='[{\"data\":\"'$DATA'\"},{\"<change-addr>\":0.0009}]'",
    "# then: signrawtransactionwithwallet + sendrawtransaction",
  ].join('\n');

  let h = '<section class="wrap wrap-narrow">';
  h += '<div class="kicker">\u25c6 FIELD MANUAL</div><h2 class="title">Etch a message onto Bitcoin</h2>';
  h += '<p class="lede" style="margin-top:12px;font-size:17px">An <span class="mono" style="font-size:.85em">OP_RETURN</span> output lets you attach a small piece of arbitrary data to a Bitcoin transaction. Miners record it in the blockchain like any other transaction \u2014 which means once it confirms, it is public and permanent.</p>';
  h += '<div class="callout"><div><div class="b">\u26a0 BEFORE YOU DO THIS</div><p style="margin-top:6px">There is no undo. Anything you write is public forever, tied to your transaction, and costs a real fee. Never include anything private, illegal, or that identifies you unless you intend to.</p></div></div>';
  h += '<div class="guide-steps">';
  h += '<div class="gstep"><div class="gnum">01</div><div><h3>Understand the tradeoff</h3><p>OP_RETURN attaches data to a provably-unspendable output. ' + escHtml(CORE30.short) + ' It is cheap but not free \u2014 you pay a fee that scales with size \u2014 and it is immutable once mined.</p></div></div>';
  h += '<div class="gstep"><div class="gnum">02</div><div><h3>Use a wallet that supports it</h3><p>' + escHtml(SPARROW.wallets) + '</p></div></div>';
  h += '<div class="gstep"><div class="gnum">03</div><div><h3>Write your message</h3><p>Plain UTF-8 text. Default nodes now relay up to 100,000 bytes across all OP_RETURN outputs, but bigger data costs a higher fee and some nodes keep the old 83-byte limit \u2014 keep it short for reliability, or split it across outputs. Then encode it to hex.</p></div></div>';
  h += `<div class="gstep"><div class="gnum">04</div><div><h3>Build the transaction</h3><p>Add one OP_RETURN output carrying your data (0 sats) plus a change output back to yourself, and set a fee rate from mempool.space.</p><div class="code">${escHtml(code)}</div></div></div>`;
  h += '<div class="gstep"><div class="gnum">05</div><div><h3>Broadcast and wait</h3><p>Sign, broadcast, and watch it hit the mempool. Once a block confirms it, it lives on-chain forever. Send it to an address we monitor and it shows up in the feed here.</p></div></div>';
  h += '</div>';
  h += '<p class="gnote">This tool only reads the chain \u2014 it never asks for your keys and cannot send anything for you.</p>';
  h += '<div class="cta" style="margin-top:26px"><a class="btn btn-primary" href="/feed">See what others have written \u2192</a></div>';
  h += '</section>';

  return h;
}

export function renderCollectionsSsr(collections: CollectionWithStats[]): string {
  let h = '<section class="wrap"><div class="kicker">\u25c6 ARCHIVE INDEX</div><h2 class="title">Collections</h2>';
  h += '<p class="lede" style="margin-top:12px;font-size:17px">Addresses grouped by the phenomenon behind them. Each collection is a running record of a specific pattern we\u2019ve watched unfold on-chain.</p>';
  h += '<div class="col-grid" style="margin-top:34px">';
  collections.forEach((c, i) => {
    const slug = c.slug || String(c.id);
    h += `<a class="col-card" href="/c/${escHtml(slug)}">`;
    h += `<div class="top"><span class="code">COL-${('0' + (i + 1)).slice(-2)}</span></div>`;
    h += `<div class="name">${escHtml(c.name)}</div>`;
    h += `<div class="desc">${escHtml(c.description || '')}</div>`;
    h += `<div class="foot"><span>${c.address_count || 0} addr</span><span>${c.message_count || 0} msgs</span><span class="read">read \u2192</span></div>`;
    h += '</a>';
  });
  h += '</div></section>';
  return h;
}

// ---------------------------------------------------------------------------
// Server-rendered message lists. Crawlers get the real records, with links to
// every /m/ page, instead of an empty shell that only fills in after four
// API round-trips in the browser. The SPA replaces <main> once it boots.
// ---------------------------------------------------------------------------

export function messageExcerpt(msg: Message, max = 280): string {
  const preview = cleanCryptoPreview(msg.content) || stripDataUris(msg.content);
  const s = String(preview || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '\u2026' : s;
}

/** Short human headline for a message: the text itself, or a protocol summary. */
export function messageHeadline(msg: Message, max = 64): string {
  const p = msg.protocol || 'text';
  if (p !== 'text') {
    const op = (msg.ops || []).find((o) => o.protocol === p) || (msg.ops || [])[0];
    const parts = [protocolLabel(p)];
    if (op?.op) parts.push(op.op);
    if (op?.amount) parts.push(op.amount);
    if (op?.tick) parts.push(`$${op.tick}`);
    if (!op?.op && !op?.tick) parts.push('transaction');
    return parts.join(' ');
  }
  const ex = messageExcerpt(msg, max);
  return ex ? `\u201c${ex}\u201d` : 'OP_RETURN message';
}



/**
 * Feed-style pages (/feed, /c, /a, /p, /tick, /block, /cat): exactly what the
 * client's renderFeed() produces, from the shared module, so hydration is a
 * no-op. Collection pages append their monitored-address cards as a block the
 * client preserves across re-renders (data-ssr-extra).
 */
export function renderFeedPage(view: FeedView): string {
  return FV.feedHTML(view);
}

/** The message page, from the shared renderer (identical to the client's renderDetail). */
export function renderDetailPage(view: FeedView & { detail: NonNullable<FeedView['detail']> }): string {
  return FV.detailHTML(view);
}

/** A chat room, from the shared renderer (identical to the client's renderChat). */
export function renderChatPage(view: FeedView): string {
  return FV.chatHTML(view);
}

export function renderCollectionExtras(col: CollectionWithStats, addresses: Address[]): string {
  const slug = col.slug || String(col.id);
  let h = '<section class="extra" data-ssr-extra style="display:flex;flex-direction:column;gap:14px;margin-top:10px">';
  if (addresses.length) {
    h += '<span class="slabel">MONITORED ADDRESSES IN THIS COLLECTION</span>';
    h += '<div style="display:flex;flex-direction:column;gap:12px">';
    for (const a of addresses) {
      h += '<div style="border:1px solid var(--line);background:var(--card);padding:14px 18px">';
      h += `<div style="font-family:'Martian Mono',monospace;font-size:13px;overflow-wrap:anywhere"><a href="/a/${escHtml(a.address)}">${escHtml(a.address)}</a></div>`;
      if (a.label) h += `<div style="font-size:13px;color:var(--fg3);margin-top:4px">${escHtml(a.label)}</div>`;
      h += '</div>';
    }
    h += '</div>';
  }
  h += `<div class="cta"><a class="btn" href="/c/${escHtml(slug)}/chat">View on-chain chat room 💬</a><a class="btn" href="/collections">← Back to collections</a></div>`;
  h += '</section>';
  return h;
}



/** Drop inline data: URIs (etched images) so previews and schema stay readable. */
export function stripDataUris(content?: string | null): string {
  if (!content) return '';
  const kept = content.split('\n').filter((l) => !/^data:[a-z0-9.+-]+\/[a-z0-9.+-]+[;,]/i.test(l.trim()));
  const out = kept.join('\n').trim();
  return out || (content.trim() ? '[inline file]' : '');
}

export function cleanCryptoPreview(content?: string | null): string {
  if (!content) return '';
  const text = stripDataUris(content).trim();
  if (text.includes('-----BEGIN PGP SIGNED MESSAGE-----')) {
    const sigIdx = text.indexOf('-----BEGIN PGP SIGNATURE-----');
    const headIdx = text.indexOf('-----BEGIN PGP SIGNED MESSAGE-----');
    let body = text.slice(headIdx, sigIdx !== -1 ? sigIdx : text.length);
    body = body.replace(/-----BEGIN PGP SIGNED MESSAGE-----[\r\n]+(Hash:[^\r\n]+[\r\n]+)?/, '').trim();
    const bMatch = body.match(/QklFMQ[A-Za-z0-9+/=]+/);
    if (bMatch) {
      const lead = body.slice(0, bMatch.index).trim();
      return lead ? `${lead} [BIE1 Payload]` : '[Electrum BIE1 ECIES Encrypted]';
    }
    return body;
  }
  if (text.includes('-----BEGIN PGP MESSAGE-----')) {
    const msgIdx = text.indexOf('-----BEGIN PGP MESSAGE-----');
    const lead = text.slice(0, msgIdx).trim();
    return lead ? `${lead} [PGP Encrypted]` : '[OpenPGP Encrypted Transmission]';
  }
  if (text.includes('QklFMQ')) {
    const match = text.match(/QklFMQ[A-Za-z0-9+/=]+/);
    if (match) {
      const lead = text.slice(0, match.index).trim();
      return lead ? `${lead} [BIE1 Payload]` : '[Electrum BIE1 ECIES Encrypted]';
    }
  }
  return text;
}





export function renderProtocolsSsr(
  protocols: Array<{ protocol: string; count: number }>,
  ticks: Array<{ protocol: string; tick: string; count: number }>,
  chain: { blocks: number; opreturn_outputs: number; runes_outputs: number; stored_txs: number } | null
): string {
  let h = '<section class="wrap"><div class="kicker">\u25c6 PROTOCOL INDEX</div><h2 class="title">Protocols</h2>';
  h += '<p class="lede" style="margin-top:12px;font-size:17px">Every OP_RETURN output of every block is decoded before it reaches the feed. These are the protocols found in every scanned block; Runes and opaque payloads are counted per block but never shown.</p>';
  if (chain && chain.blocks) {
    const pct = chain.opreturn_outputs ? Math.round((chain.runes_outputs / chain.opreturn_outputs) * 100) : 0;
    h += '<div class="stats" style="margin-top:28px">';
    h += `<div class="stat"><div class="v">${chain.blocks.toLocaleString()}</div><div class="l">Blocks scanned</div></div>`;
    h += `<div class="stat"><div class="v">${chain.opreturn_outputs.toLocaleString()}</div><div class="l">OP_RETURN outputs seen</div></div>`;
    h += `<div class="stat"><div class="v">${pct}%</div><div class="l">Runes (counted, not shown)</div></div>`;
    h += `<div class="stat"><div class="v">${chain.stored_txs.toLocaleString()}</div><div class="l">Transactions decoded</div></div>`;
    h += '</div>';
  }
  h += '<div class="col-grid" style="margin-top:34px">';
  for (const p of protocols) {
    if (p.protocol === 'text') continue;
    h += `<a class="col-card" href="/p/${escHtml(p.protocol)}"><div class="top"><span class="code">${escHtml(p.protocol)}</span></div>`;
    h += `<div class="name">${escHtml(protocolLabel(p.protocol))}</div>`;
    h += `<div class="desc">${escHtml(protocolBlurb(p.protocol))}</div>`;
    h += `<div class="foot"><span>${p.count.toLocaleString()} txs</span><span class="read">browse \u2192</span></div></a>`;
  }
  h += '</div>';
  if (ticks.length) {
    h += '<div class="kicker" style="margin-top:40px">\u25c6 MOST ACTIVE TICKERS</div><div class="chips" style="border-bottom:none">';
    for (const t of ticks) h += `<a class="chip" href="/tick/${escHtml(encodeURIComponent(t.tick))}">$${escHtml(t.tick)} <span style="opacity:.55">${t.count.toLocaleString()}</span></a>`;
    h += '</div>';
  }
  h += '</section>';
  return h;
}

export function renderProtocolsMarkdown(
  siteUrl: string,
  protocols: Array<{ protocol: string; count: number }>,
  ticks: Array<{ protocol: string; tick: string; count: number }>
): string {
  let md = `# OP_RETURN Protocols — The Permanent Record\n\nTransactions per decoded protocol across every scanned block (Runes and opaque payloads are counted per block, not stored).\n\n`;
  for (const p of protocols) {
    if (p.protocol === 'text') continue;
    md += `- [${protocolLabel(p.protocol)}](${siteUrl}/p/${p.protocol}) (\`${p.protocol}\`): ${p.count}\n`;
  }
  if (ticks.length) {
    md += `\n## Most active tickers\n\n`;
    for (const t of ticks) md += `- [$${t.tick}](${siteUrl}/tick/${encodeURIComponent(t.tick)}) via ${t.protocol}: ${t.count}\n`;
  }
  md += `\n- API: ${siteUrl}/api/protocols · ${siteUrl}/api/ticks · ${siteUrl}/api/chain\n`;
  return md;
}

/** One line per protocol for the index page. */
export function protocolBlurb(protocol: string): string {
  switch (protocol) {
    case 'ico-20':
    case 'crc-20':
    case 'brc-20':
      return 'JSON token operations ({"p":"…","op":"…","tick":"…"}) such as the $LEAF mints sent to the Genesis address.';
    case 'omni':
      return 'Omni Layer transfers, mostly Tether (USDT) simple sends.';
    case 'thorchain':
      return 'THORChain outbound (OUT:) and refund memos plus swap instructions.';
    case 'bridge-memo':
      return 'Cross-chain bridge memos naming the destination asset and address.';
    case 'evm-hash':
      return 'Bare 32-byte EVM transaction or commitment hashes.';
    case 'lifi':
      return 'LI.FI bridge routing markers.';
    case 'rootstock':
      return 'Rootstock merge-mining commitments (RSKBLOCK:).';
    case 'stacks':
      return 'Stacks block commits, leader keys and STX operations.';
    case 'core-dao':
      return 'Core DAO validator delegation tags.';
    case 'exsat':
      return 'exSat data-availability tags.';
    case 'syscoin':
      return 'Syscoin merge-mining commitments.';
    case 'satflow':
    case 'brc20-prog':
    case 'dio':
    case 'alpn':
      return 'Bare protocol marker with no readable payload.';
    default:
      return protocol.endsWith('-20') ? 'JSON token operations.' : 'Structured protocol data decoded from the OP_RETURN payload.';
  }
}




export function renderProtocolMarkdown(siteUrl: string, protocol: string, label: string, count: number): string {
  return `# Protocol: ${label} (${protocol})\n\n${count} transactions carrying ${label} OP_RETURN outputs across every scanned block.\n\n- Feed API: ${siteUrl}/api/messages?protocol=${encodeURIComponent(protocol)}\n- [All protocols](${siteUrl}/api/protocols)\n`;
}

export function renderTickMarkdown(siteUrl: string, tick: string, count: number): string {
  return `# Ticker: ${tick}\n\n${count} on-chain operations across every scanned block.\n\n- Feed API: ${siteUrl}/api/messages?tick=${encodeURIComponent(tick)}\n`;
}

export function renderBlockMarkdown(siteUrl: string, block: { height: number; hash: string; time: number; tx_count: number; opreturn_count: number; runes_count: number; binary_count: number; stored_count: number }): string {
  return `# Block ${block.height}\n\n- Hash: \`${block.hash}\`\n- Time: ${new Date(block.time * 1000).toISOString()}\n- Transactions: ${block.tx_count}\n- OP_RETURN outputs: ${block.opreturn_count}\n- Runes: ${block.runes_count}\n- Opaque binary: ${block.binary_count}\n- Archived: ${block.stored_count}\n- Messages API: ${siteUrl}/api/messages?kind=all&block=${block.height}\n`;
}

export function renderNotFoundSsr(title?: string, message?: string): string {
  let h = '<section class="wrap wrap-narrow" style="text-align:center;padding-top:clamp(40px,8vw,90px)">';
  h += '<div class="kicker">\u25c6 404 NOT FOUND</div>';
  h += `<h1 class="hero-title" style="font-size:clamp(32px,6vw,64px);margin:16px auto">${escHtml(title || 'Record not found')}</h1>`;
  h += `<p class="lede" style="margin:0 auto 32px">${escHtml(message || 'The requested blockchain transmission or collection does not exist in this archive.')}</p>`;
  h += '<div class="cta" style="justify-content:center">';
  h += '<a class="btn btn-primary" href="/">Return to transmissions \u2192</a>';
  h += '<a class="btn" href="/collections">Browse collections</a>';
  h += '</div>';
  h += '</section>';
  return h;
}
