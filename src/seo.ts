import { CATEGORIES, categorySlug } from './classify';
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

export function generateLlmsTxt(siteUrl: string): string {
  return `# The Permanent Record — Bitcoin OP_RETURN Monitor

> opreturn.xyz is a real-time, high-availability monitor and historical archive for arbitrary data and messages embedded inside the Bitcoin blockchain via OP_RETURN outputs. It tracks active bulletin boards, hacker communications, dormant wallet notices, and cultural memorials, with AI categorization and high-performance edge caching.

## What is Bitcoin OP_RETURN?

- **Opcode Mechanics**: \`OP_RETURN\` (\`0x6a\`) is a script opcode that marks a transaction output as provably unspendable.
- **UTXO Set Health**: Because provably unspendable outputs can never be spent, compliant nodes immediately prune them from their RAM-resident UTXO (Unspent Transaction Output) set, eliminating UTXO bloat while permanently committing the data to the blockchain history.
- **Data Limits**: Standard relay policy historically capped OP_RETURN data at 40 bytes (2014) and 80 bytes (2016). In 2025, Bitcoin Core v30 removed the default 80-byte relay cap (\`-datacarriersize\`), enabling standard propagation of larger arbitrary data payloads and multi-output data chaining.
- **Cost**: Embedding data requires paying miner fees proportional to transaction virtual size (vBytes), with output value typically set to 0 sats.
- **Immutability**: Once confirmed inside a Bitcoin block, transmissions are mathematically unalterable, uncensorable, and permanently replicated across tens of thousands of nodes worldwide.

## Monitored Collections & On-Chain Phenomena

The archive focuses on addresses that have evolved into public bulletin boards:
1. **Liquid Network Peg-Out Bulletin Board**: Addresses from the September 2026 Liquid Network whitehat incident (~3,996 BTC peg-out negotiation between hackers and Blockstream security).
2. **Coldcard Exploit Bulletin Board**: Primary holding addresses from the July-August 2026 Coldcard firmware RNG exploit, filled with laundry ads, victim pleas, threats, and prompt injections.
3. **High-Value Dormant Wallet Notices**: Early 2010-2011 high-balance addresses (including the Mt. Gox 1Feex address) targeted with legal notices, ownership claims, and phishing attempts.
4. **Genesis & Satoshi Tribute**: The Genesis block address (\`1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa\`), receiving ongoing memorials and prayers to Satoshi Nakamoto.
5. **Russian Intelligence Marking Campaign**: Addresses marked in 2022 via OP_RETURN as associated with GRU / SVR / FSB intelligence agencies.
6. **Cultural Memorials & Digital Graffiti**: Permanent personal tributes, biblical verses, and vanity address communications.
7. **Historical Hacker Negotiation Boards**: Historic addresses used for public bounty negotiations and victim-attacker dialogue.

## AI Classification Taxonomy

Transmissions are classified into seven discrete categories:
- \`Laundry / Service Ads\`: Mixers, crypto laundry, OTC desks, phishing links.
- \`Begging / Victim Appeals\`: Requests for refunds, charity, hospital bills, student loans.
- \`Threats / Hostility\`: Law enforcement ultimatums, hacker taunts, extortion.
- \`Prompt Injection\`: Text attempting to subvert LLM indexing bots (e.g., 'Ignore previous instructions').
- \`Haiku / Philosophical\`: Poetry, blockchain maxims, existential reflections.
- \`Self-deprecating / Black Humor\`: Irony, despair, memes about losing private keys.
- \`Other\`: General greetings, unclassified data, signatures.

## Public REST API

- \`GET ${siteUrl}/api/collections\` — All collections with address & message counts.
- \`GET ${siteUrl}/api/messages?sort=hot|new&limit=50&collection_id=&address=&category=\` — Filtered transmission feed.
- \`GET ${siteUrl}/api/chat?collection_id=&address=\` — Chronological conversation stream.
- \`GET ${siteUrl}/api/categories\` — Category distribution and counts.
- \`GET ${siteUrl}/api/message/:key\` — Message lookup by ID or txid.
- \`GET ${siteUrl}/api/price?ts=\` — Historical USD price at block timestamp.

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
- Bitcoin Core v30 (2025) removed the default 80-byte relay cap, permitting standard propagation of larger payloads.
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

### Step 3: Constructing with Sparrow Wallet
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

export function generateSitemapXml(
  siteUrl: string,
  collections: CollectionWithStats[],
  addresses: Address[],
  topMessages: SitemapMessage[]
): string {
  const urls: Array<{ loc: string; lastmod?: string; changefreq: string; priority: string }> = [];

  const today = new Date().toISOString().slice(0, 10);

  // Core pages
  urls.push({ loc: `${siteUrl}/`, lastmod: today, changefreq: 'hourly', priority: '1.0' });
  urls.push({ loc: `${siteUrl}/feed`, lastmod: today, changefreq: 'hourly', priority: '0.9' });
  urls.push({ loc: `${siteUrl}/collections`, lastmod: today, changefreq: 'daily', priority: '0.9' });
  urls.push({ loc: `${siteUrl}/guide`, lastmod: today, changefreq: 'monthly', priority: '0.8' });

  // Collections & Chat
  for (const col of collections) {
    const slug = col.slug || String(col.id);
    urls.push({
      loc: `${siteUrl}/c/${slug}`,
      lastmod: today,
      changefreq: 'daily',
      priority: '0.8',
    });
    urls.push({
      loc: `${siteUrl}/c/${slug}/chat`,
      lastmod: today,
      changefreq: 'daily',
      priority: '0.8',
    });
  }

  // Categories
  for (const cat of CATEGORIES) {
    urls.push({
      loc: `${siteUrl}/cat/${categorySlug(cat)}`,
      lastmod: today,
      changefreq: 'daily',
      priority: '0.7',
    });
  }

  // Monitored Addresses & Chat
  for (const addr of addresses) {
    urls.push({
      loc: `${siteUrl}/a/${encodeURIComponent(addr.address)}`,
      lastmod: today,
      changefreq: 'daily',
      priority: '0.7',
    });
    urls.push({
      loc: `${siteUrl}/a/${encodeURIComponent(addr.address)}/chat`,
      lastmod: today,
      changefreq: 'daily',
      priority: '0.7',
    });
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
            {
              name: 'sort',
              in: 'query',
              schema: { type: 'string', enum: ['hot', 'new'], default: 'hot' },
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
  return `# auth.md — The Permanent Record Agent Registration & Discovery

> Machine-readable agent registration, authorization, and discovery specification for The Permanent Record (opreturn.xyz).

## 1. Agent Audience & Access Model

The Permanent Record indexes public, immutable Bitcoin blockchain data.
- **Agent Audience**: Autonomous AI agents, LLM tool executors, indexers, and automated scrapers.
- **Read Access**: Completely anonymous and unauthenticated. AI agents can query all public APIs (\`/api/messages\`, \`/api/collections\`, \`/api/chat\`, \`/mcp\`) without registration or API keys.
- **Rate Limits**: Governed by Cloudflare edge protection with high-availability SWR caching. Standard User-Agent identifiers receive maximum throughput.
- **Write Actions**: Rate-limited and anti-spam protected using a client-mined 16-bit Proof-of-Work nonce (\`sha256(id:nonce)\` having 16 leading zero bits). No KYC or centralized account required.

## 2. Agent Registration & Provisioning Endpoints

When automated onboarding or token acquisition is required by client agent frameworks:
- **Registration Endpoint**: \`${siteUrl}/oauth/register\`
- **Token Endpoint**: \`${siteUrl}/oauth/token\`
- **Revocation Endpoint**: \`${siteUrl}/oauth/revoke\`
- **Claim / Liveness URI**: \`${siteUrl}/api/health\`

## 3. Supported Authentication & Identity Methods

### A. Anonymous Access (Recommended for Read Operations)
- **Identity Type**: \`anonymous\`
- **Credential Type**: None required (\`none\`)
- **Claim URI**: \`${siteUrl}/api/health\`
- **Scopes**: \`read:messages\`, \`read:collections\`

### B. ID-JAG Identity Assertion
- **Identity Type**: \`identity_assertion\`
- **Assertion Type**: \`urn:ietf:params:oauth:token-type:id-jag\`
- **Credential Type**: \`bearer_token\`
- **Revocation URI**: \`${siteUrl}/oauth/revoke\`

### C. Verified Email Assertion
- **Identity Type**: \`identity_assertion\`
- **Assertion Type**: \`verified_email\`
- **Credential Type**: \`bearer_token\`
- **Claim URI**: \`${siteUrl}/oauth/claim\`

## 4. OAuth 2.0 & Discovery Metadata

- **OAuth Protected Resource Metadata (PRM, RFC 9728)**: \`${siteUrl}/.well-known/oauth-protected-resource\`
- **OAuth Authorization Server Metadata (RFC 8414)**: \`${siteUrl}/.well-known/oauth-authorization-server\`
- **OpenID Connect Configuration**: \`${siteUrl}/.well-known/openid-configuration\`
- **JSON Web Key Set (JWKS)**: \`${siteUrl}/.well-known/jwks.json\`
- **API Catalog (RFC 9727)**: \`${siteUrl}/.well-known/api-catalog\`

## 5. Credential Usage

For unauthenticated operations, simply execute standard HTTP \`GET\` requests. For token-authenticated sessions, pass the bearer token via the standard \`Authorization\` header:

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
    authorization_servers: [siteUrl],
    scopes_supported: ['read:messages', 'read:collections'],
    bearer_methods_supported: ['header'],
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
    scopes_supported: ['read:messages', 'read:collections'],
    response_types_supported: ['token', 'code'],
    grant_types_supported: ['client_credentials', 'anonymous', 'authorization_code'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    events_supported: ['urn:ietf:params:oauth:event:token-revoked'],
    service_documentation: `${siteUrl}/llms.txt`,
    agent_auth: {
      skill: `${siteUrl}/auth.md`,
      register_uri: `${siteUrl}/oauth/register`,
      identity_types_supported: ['anonymous', 'identity_assertion'],
      anonymous: {
        credential_types_supported: ['none'],
        claim_uri: `${siteUrl}/api/health`,
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
        description: 'Retrieve curated Bitcoin address collections (Liquid Network whitehat, Coldcard exploit, Mt. Gox 1Feex, Genesis tributes).',
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
        description: 'Search monitored Bitcoin OP_RETURN messages by collection, address, or category',
        inputSchema: {
          type: 'object',
          properties: {
            collection_id: { type: 'number', description: 'Collection ID filter' },
            address: { type: 'string', description: 'Bitcoin address filter' },
            category: { type: 'string', description: 'Category slug' },
            sort: { type: 'string', enum: ['hot', 'new'], default: 'hot' },
            limit: { type: 'number', default: 20 },
          },
        },
      },
      {
        name: 'get_collections',
        description: 'List all monitored Bitcoin collections (Liquid Network whitehats, Coldcard exploit, Mt Gox, Genesis)',
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
// 7. Schema.org JSON-LD Structured Data Builders
// ---------------------------------------------------------------------------

export const FAQ_ITEMS = [
  {
    q: 'What is an OP_RETURN message in Bitcoin?',
    a: 'An OP_RETURN output is a Bitcoin Script opcode (0x6a) used to embed arbitrary data into a transaction. Because OP_RETURN outputs are provably unspendable, nodes exclude them from the RAM-resident UTXO set, making it the standard method for recording permanent, tamper-evident messages without blockchain bloat.',
  },
  {
    q: 'Can an OP_RETURN message be deleted, altered, or censored?',
    a: 'No. Once a transaction carrying an OP_RETURN output is confirmed inside a Bitcoin block, it becomes an immutable part of the distributed ledger. It cannot be altered, edited, or removed by any central authority, corporation, or node operator.',
  },
  {
    q: 'How much data can fit inside an OP_RETURN output?',
    a: 'Historically, Bitcoin standard relay policy restricted OP_RETURN outputs to 40 bytes and later 80 bytes. In 2025, Bitcoin Core v30 removed the default 80-byte relay cap, allowing larger arbitrary data payloads to propagate across the network as standard transactions.',
  },
  {
    q: 'What kinds of messages are monitored on The Permanent Record?',
    a: 'The Permanent Record monitors high-profile Bitcoin addresses that have evolved into public bulletin boards: whitehat and hacker communications (such as the Liquid Network and Coldcard incidents), dormant early wallet legal notices (including Mt. Gox 1Feex), Genesis block tributes to Satoshi Nakamoto, and geopolitical marking campaigns.',
  },
  {
    q: 'How does AI classification categorize transmissions?',
    a: 'Each message is decoded to UTF-8 and processed through an OpenAI-compatible endpoint that classifies content into one of seven categories: Laundry / Service Ads, Begging / Victim Appeals, Threats / Hostility, Prompt Injection, Haiku / Philosophical, Self-deprecating / Black Humor, or Other.',
  },
  {
    q: 'How can I etch my own message into Bitcoin?',
    a: 'You can attach an OP_RETURN output using non-custodial tools such as Sparrow Wallet (Tools → Add OP_RETURN), Bitcoin Core CLI (createrawtransaction), or Electrum. You pay a standard network miner fee proportional to data size. Full instructions are available in our Field Manual.',
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
        text: 'OP_RETURN attaches data to a provably-unspendable output. Bitcoin Core v30 removed the 80-byte relay cap, but larger data pays higher miner fees. The message is immutable once confirmed.',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Use a wallet that supports OP_RETURN',
        text: 'Choose a non-custodial wallet like Sparrow Wallet, Bitcoin Core, or Electrum. Custodial exchanges do not support arbitrary data outputs.',
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
    headline: msg.content ? `\u201c${msg.content.slice(0, 100)}\u201d` : 'Bitcoin OP_RETURN transmission',
    articleBody: msg.content || '',
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
OP_RETURN attaches data to a provably-unspendable output. Bitcoin Core v30 removed the 80-byte default cap, allowing larger data to relay and confirm.

### 2. Use a Wallet that Supports OP_RETURN
- **Sparrow Wallet**: Tools → Add OP_RETURN output
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
  return `# All Transmissions — The Permanent Record\n\nEvery monitored OP_RETURN message, live from the Bitcoin chain.\n\n- [Collections](${siteUrl}/collections)\n- [Field Manual](${siteUrl}/guide)\n- [API Specification](${siteUrl}/llms.txt)\n`;
}

// ---------------------------------------------------------------------------
// 9. Server-Side Rendering (SSR) Pre-rendered HTML for <main id="app">
// ---------------------------------------------------------------------------

export function renderLandingSsr(
  collectionsCount: number,
  addressesCount: number,
  featuredMsg?: Message | null,
  colName?: string
): string {
  let h = '<section class="wrap" style="padding-bottom:clamp(30px,4vw,56px)">';
  h += '<div class="pill"><span class="dot"></span>LIVE ON-CHAIN \u00b7 IMMUTABLE BITCOIN MONITOR</div>';
  h += '<h1 class="hero">People are leaving messages inside Bitcoin. Forever.</h1>';
  h += '<p class="lede">Every one of these was etched into an <span class="mono" style="font-size:.85em">OP_RETURN</span> output on the blockchain \u2014 threats, confessions, prayers, ads, haiku. Immutable. Unstoppable. We monitor the strangest addresses on the network and archive what shows up.</p>';
  h += '<div class="cta"><a class="btn btn-primary" href="/feed">Enter the feed \u2192</a><a class="btn" href="/collections">Browse collections</a></div>';
  h += '<p class="mono" style="margin-top:20px;font-size:13px;color:var(--fg4)">Want to leave your own mark? <a href="/guide" style="color:var(--sig);text-decoration:underline">Read the field manual \u2192</a></p>';
  h += '</section>';

  if (featuredMsg) {
    h += `<section class="featured"><div class="inner"><div class="k">\u25c6 TRANSMISSION OF THE DAY</div>`;
    h += `<blockquote>\u201c${escHtml(featuredMsg.content)}\u201d</blockquote>`;
    h += `<div class="meta"><span class="strong">\u21b3 ${escHtml(colName || 'Monitored address')}</span><span>${escHtml(shortAddr(featuredMsg.address))}</span><span class="sig">\u2665 ${featuredMsg.likes}</span><a href="/m/${escHtml(featuredMsg.txid)}" style="color:inherit;text-decoration:underline">view artifact \u2192</a></div>`;
    h += `</div></section>`;
  }

  h += '<section class="wrap" style="padding-top:clamp(32px,5vw,64px)">';
  h += '<div class="stats">';
  h += `<div class="stat"><div class="v">${collectionsCount}</div><div class="l">Collections tracked</div></div>`;
  h += `<div class="stat"><div class="v">${addressesCount}</div><div class="l">Addresses monitored</div></div>`;
  h += '<div class="stat"><div class="v">~3min</div><div class="l">Fresh every poll</div></div>';
  h += '<div class="stat"><div class="v">\u221e</div><div class="l">Years it stays online</div></div>';
  h += '</div>';

  // FAQ section
  h += '<div class="faq-wrap">';
  h += '<div class="kicker">\u25c6 FREQUENTLY ASKED QUESTIONS \u00b7 THE PERMANENT RECORD</div>';
  h += '<h2 class="title" style="font-size:clamp(24px,3.5vw,36px)">Understanding Bitcoin OP_RETURN Transmissions</h2>';
  h += '<div class="faq-grid">';
  for (const item of FAQ_ITEMS) {
    h += '<div class="faq-item">';
    h += `<h3 class="faq-q">${escHtml(item.q)}</h3>`;
    h += `<p class="faq-a">${escHtml(item.a)}</p>`;
    h += '</div>';
  }
  h += '</div></div>';
  h += '</section>';

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
  h += '<div class="gstep"><div class="gnum">01</div><div><h3>Understand the tradeoff</h3><p>OP_RETURN attaches data to a provably-unspendable output. The old 80-byte cap was a relay policy, not a consensus rule \u2014 Bitcoin Core v30 (2025) dropped that default, so larger payloads now relay and confirm, and a message can span several OP_RETURN outputs. It is cheap but not free \u2014 you pay a fee that scales with size \u2014 and it is immutable once mined.</p></div></div>';
  h += '<div class="gstep"><div class="gnum">02</div><div><h3>Use a wallet that supports it</h3><p>Sparrow Wallet (Tools \u2192 add an OP_RETURN output), Bitcoin Core via <span class="mono" style="font-size:.9em">bitcoin-cli</span>, or Electrum\u2019s console. Custodial and exchange wallets will not let you.</p></div></div>';
  h += '<div class="gstep"><div class="gnum">03</div><div><h3>Write your message</h3><p>Plain UTF-8 text. There is no longer a hard 80-byte limit, but bigger data costs a higher fee and some nodes still run tighter relay limits \u2014 keep it short for reliability, or split it across outputs. Then encode it to hex.</p></div></div>';
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

export function renderCollectionSsr(col: CollectionWithStats, addresses: Address[]): string {
  const slug = col.slug || String(col.id);
  let h = '<section class="wrap wrap-narrow">';
  h += `<div class="kicker">\u25c6 COLLECTION ARCHIVE</div>`;
  h += `<h2 class="title" style="font-size:clamp(26px,4vw,40px)">${escHtml(col.name)}</h2>`;
  h += `<p class="lede" style="margin-top:12px;font-size:17px">${escHtml(col.description || '')}</p>`;
  h += '<div class="cta" style="margin-top:24px">';
  h += `<a class="btn btn-primary" href="/c/${escHtml(slug)}/chat">View on-chain chat room \ud83d\udcac</a>`;
  h += `<a class="btn" href="/collections">\u2190 Back to collections</a>`;
  h += '</div>';

  if (addresses.length) {
    h += '<div style="margin-top:38px">';
    h += '<div class="kicker">\u25c6 MONITORED ADDRESSES IN THIS COLLECTION</div>';
    h += '<div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">';
    for (const a of addresses) {
      h += '<div style="border:1px solid var(--line);background:var(--card);padding:14px 18px">';
      h += `<div style="font-family:\'Martian Mono\',monospace;font-size:13px"><a href="/a/${escHtml(a.address)}">${escHtml(a.address)}</a></div>`;
      if (a.label) {
        h += `<div style="font-size:13px;color:var(--fg3);margin-top:4px">${escHtml(a.label)}</div>`;
      }
      h += '</div>';
    }
    h += '</div></div>';
  }

  h += '</section>';
  return h;
}

export function renderAddressSsr(address: string): string {
  let h = '<section class="wrap wrap-narrow">';
  h += '<div class="kicker">\u25c6 BITCOIN ADDRESS RECORD</div>';
  h += `<h2 class="title" style="font-size:clamp(24px,3.5vw,36px);overflow-wrap:anywhere">${escHtml(address)}</h2>`;
  h += '<p class="lede" style="margin-top:12px">Archived on-chain OP_RETURN transmissions sent to this Bitcoin address.</p>';
  h += '<div class="cta" style="margin-top:20px">';
  h += `<a class="btn btn-primary" href="/a/${escHtml(address)}/chat">View on-chain chat \ud83d\udcac</a>`;
  h += `<a class="btn" href="https://mempool.space/address/${escHtml(address)}" target="_blank" rel="noopener">Inspect on mempool.space \u2197</a>`;
  h += '</div>';
  h += '</section>';
  return h;
}

export function renderMessageSsr(msg: Message, colName?: string): string {
  let h = '<section class="wrap wrap-card">';
  h += '<a class="back" href="/feed">\u2190 Back to transmissions</a>';
  h += '<div class="artifact"><div class="bar"><span>\u25c6 OP_RETURN \u00b7 IMMUTABLE RECORD</span>';
  h += `<span class="bar-right"><span class="st ${msg.is_mempool ? 'mem' : 'conf'}">${msg.is_mempool ? '\u25f7 IN MEMPOOL' : '\u2713 CONFIRMED'}</span></span></div>`;
  h += '<div class="pad">';
  if (msg.category) {
    h += `<span class="cat">${escHtml(msg.category)}</span>`;
  }
  h += `<blockquote>\u201c${escHtml(msg.content || 'OP_RETURN transmission')}\u201d</blockquote>`;
  h += '<div class="metagrid">';
  if (colName) {
    h += `<div class="cell full"><div class="k">Collection</div><div class="v single">${escHtml(colName)}</div></div>`;
  }
  h += `<div class="cell"><div class="k">Address</div><div class="v"><a href="/a/${escHtml(msg.address)}">${escHtml(shortAddr(msg.address))}</a></div></div>`;
  h += `<div class="cell"><div class="k">Transaction</div><div class="v"><a href="https://mempool.space/tx/${escHtml(msg.txid)}" target="_blank" rel="noopener">${escHtml(msg.txid.slice(0, 10))}\u2026</a></div></div>`;
  h += `<div class="cell"><div class="k">Likes</div><div class="v">\u2665 ${msg.likes}</div></div>`;
  h += `<div class="cell"><div class="k">Status</div><div class="v">${msg.is_mempool ? 'mempool' : 'confirmed'}</div></div>`;
  h += '</div></div>';
  h += '<div class="actions">';
  h += `<a class="act" href="https://mempool.space/tx/${escHtml(msg.txid)}" target="_blank" rel="noopener">View on mempool \u2197</a>`;
  if (msg.collection_id) {
    h += `<a class="act" href="/collections">Browse collections</a>`;
  }
  h += '</div></div>';
  h += '<p class="caption">Etched into the Bitcoin blockchain. It cannot be deleted, edited, or taken down.</p>';
  h += '</section>';
  return h;
}

export function renderCategorySsr(categoryName: string, count: number): string {
  let h = '<section class="wrap wrap-narrow">';
  h += '<div class="kicker">\u25c6 CATEGORY ARCHIVE</div>';
  h += `<h2 class="title">${escHtml(categoryName)}</h2>`;
  h += `<p class="lede" style="margin-top:12px">${count} archived Bitcoin OP_RETURN messages classified under this taxonomy.</p>`;
  h += '<div class="cta" style="margin-top:20px">';
  h += '<a class="btn btn-primary" href="/feed">Explore all transmissions \u2192</a>';
  h += '</div>';
  h += '</section>';
  return h;
}

export function renderFeedSsr(): string {
  let h = '<section class="wrap wrap-narrow">';
  h += '<div class="kicker">\u25c6 EVERY MONITORED ADDRESS</div>';
  h += '<h2 class="title">All transmissions</h2>';
  h += '<p class="lede" style="margin-top:12px">Every monitored OP_RETURN message, live from the Bitcoin chain.</p>';
  h += '<div class="cta" style="margin-top:20px">';
  h += '<a class="btn" href="/collections">Browse collections</a>';
  h += '<a class="btn" href="/guide">Etch manual \u2192</a>';
  h += '</div>';
  h += '</section>';
  return h;
}

export function renderNotFoundSsr(title?: string, message?: string): string {
  let h = '<section class="wrap wrap-narrow" style="text-align:center;padding-top:clamp(40px,8vw,90px)">';
  h += '<div class="kicker">\u25c6 404 NOT FOUND</div>';
  h += `<h1 class="hero" style="font-size:clamp(32px,6vw,64px);margin:16px auto">${escHtml(title || 'Record not found')}</h1>`;
  h += `<p class="lede" style="margin:0 auto 32px">${escHtml(message || 'The requested blockchain transmission or collection does not exist in this archive.')}</p>`;
  h += '<div class="cta" style="justify-content:center">';
  h += '<a class="btn btn-primary" href="/">Return to transmissions \u2192</a>';
  h += '<a class="btn" href="/collections">Browse collections</a>';
  h += '</div>';
  h += '</section>';
  return h;
}
