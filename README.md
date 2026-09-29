# The Permanent Record — Bitcoin OP_RETURN Explorer

*opreturn.xyz* — Serverless OP_RETURN explorer for Bitcoin. Built on
**Cloudflare Workers + Hono + TypeScript + D1**, with a protocol registry that
decodes every OP_RETURN output, AI classification of the human messages, and a
single-page web UI in the "Ledger" layout: a persistent sidebar with search,
nav and feed filters, a right rail with the chain census, message rows, a
message detail card with the on-chain record, collection and protocol tables,
chat rooms, a field manual with a live encoder, a mobile tab bar with a filter
sheet, and a dark mode toggle. The UI is one no-build file (`src/ui.ts`:
one `<style>` block and one inline script); crawlers get server-rendered
shells from `src/seo.ts` that use the same row markup.

- **Full-chain ingestion** (`src/ingest.ts`): every cron run downloads new raw
  blocks from an Esplora-style API (`btc.tx.taxi` by default, mempool.space and
  blockstream.info as fallbacks), parses them in the Worker (`src/blocks.ts`),
  decodes every OP_RETURN output and stores the transactions whose protocol is
  worth a row. Runes (~98% of all OP_RETURN outputs) and opaque binary payloads
  are counted per block, not stored. Reorgs roll back to the fork height; a
  backwards cursor backfills history to a configurable floor.
- **Protocol registry** (`src/protocols.ts`): `text`, JSON token ops such as
  `ico-20` / `crc-20` / `brc-20` (e.g. $LEAF), `omni`, `thorchain`,
  `bridge-memo`, `evm-hash`, `lifi`, and merge-mining / sidechain tags
  (`rootstock`, `stacks`, `core-dao`, `exsat`, `syscoin`). Only `text` rows go
  to the AI classifier.
- **Address monitor** (the original feature): monitored addresses are still
  polled every 3 minutes (confirmed + mempool) and grouped into **Collections**;
  those rows are attributed via `monitored_address`.
- Feed dedupe ("same content to the same address") is precomputed
  (`is_dup` / `dup_count`) so every page is a plain keyset query over an index.
- Users can **like** messages (16-bit proof-of-work nonce, verified in
  `src/index.ts`) and sort by **Hottest** or **Newest**.

## Project layout

```
├── collections.json        # Seed collections/addresses (single source of truth)
├── migrations/             # D1 schema (0007 = protocols/ops/dedupe, 0008 = blocks/cursors)
├── wrangler.jsonc          # Worker config, vars, cron trigger
├── scripts/loadtest-seed.mjs # Seeds 400k synthetic rows into local D1 for query timing
├── test/                   # vitest: protocol registry, raw block parser, address encoding
└── src/
    ├── index.ts            # Hono app: public + admin routes, pages, worker entry
    ├── cron.ts             # ingest → poll → reparse → reconcile → details → classify
    ├── ingest.ts           # Full-chain block ingestion, cursors, reorg handling
    ├── blocks.ts           # Raw block parser (outputs, txids)
    ├── address.ts          # scriptPubKey → address, sync SHA-256, base58/bech32
    ├── protocols.ts        # OP_RETURN protocol registry (pure, unit-tested)
    ├── db.ts               # D1 query helpers
    ├── mempool.ts          # Esplora-style API client (hosts, fallbacks, raw blocks)
    ├── classify.ts         # OpenAI-compatible chat/completions wrapper
    ├── seed.ts             # ensureSeeded() using collections.json
    ├── seo.ts              # SSR shells, sitemap, llms.txt, OpenAPI, MCP card
    ├── ui.ts               # Single-page web UI (served at GET /)
    └── types.ts
```

## Setup

```bash
npm install

# 1. Create the D1 database and paste the printed id into wrangler.toml
npx wrangler d1 create opreturn-monitor

# 2. Apply the schema locally (and later: --remote)
npm run db:migrate:local
```

### Environment variables

`wrangler.jsonc` holds non-secret vars:

| Var | Purpose |
|-----|---------|
| `MEMPOOL_BASE_URL` | Primary Esplora-style API (default `https://btc.tx.taxi`) |
| `MEMPOOL_FALLBACKS` | Comma-separated fallback hosts |
| `INGEST_FORWARD` | `1` = scan new blocks every cron run (full-chain feed) |
| `INGEST_BACKFILL` | `1` = once caught up, walk backwards to `BACKFILL_DAYS` |
| `INGEST_MAX_BLOCKS_PER_RUN`, `INGEST_TIME_BUDGET_MS`, `BACKFILL_DAYS` | Ingestion limits |
| `OPENAI_MODEL`, `OPENAI_API_BASE`, `AI_MAX_PER_RUN`, `AI_DELAY_MS`, `AI_BATCH_SIZE` | Classifier |

Both ingest flags off restores the pre-explorer behaviour (address polling only).

Set secrets in production with `wrangler secret put`:

```bash
npx wrangler secret put OPENAI_API_KEY   # required for AI classification
npx wrangler secret put ADMIN_KEY        # required for /api/admin/*
npx wrangler secret put CRON_SECRET      # required for POST /api/cron/run
```

For local dev, put the same values in a `.dev.vars` file (git-ignored).

## Local development

```bash
npm run dev            # http://localhost:8787
```

Open the UI, then seed + run a manual poll:

```bash
curl -X POST -H 'x-admin-key: devkey' localhost:8787/api/admin/seed
curl -X POST -H 'x-cron-secret: devcron' localhost:8787/api/cron/run
```

## Deploy

```bash
npm run db:migrate:remote   # apply schema to production D1
npm run deploy              # push worker + cron trigger
```

## API

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/` | – | Web UI (SSR + dynamic client hydration) |
| GET | `/robots.txt` | – | Search & AI crawler directives (RFC 9309 + Content-Signal) |
| GET | `/sitemap.xml` | – | Dynamic XML sitemap covering collections, categories, addresses, and messages |
| GET | `/llms.txt` | – | LLM Context file (summary, protocol definitions, collections, API) |
| GET | `/llms-full.txt` | – | Full LLM reference dossier with CLI examples and address directory |
| GET | `/.well-known/api-catalog` | – | RFC 9727 API Catalog Linkset (`application/linkset+json`) |
| GET | `/api/openapi.json` | – | OpenAPI 3.0 specification for machine discovery |
| GET | `/auth.md` | – | Agent authorization & authentication discovery policy |
| GET | `/.well-known/oauth-protected-resource` | – | RFC 9728 OAuth 2.0 Protected Resource Metadata |
| GET | `/.well-known/oauth-authorization-server` | – | RFC 8414 OAuth 2.0 Authorization Server Metadata |
| GET | `/.well-known/agent-card.json` | – | A2A Protocol Agent Card |
| GET | `/.well-known/mcp/server-card.json` | – | Model Context Protocol (MCP SEP-1649) Server Card |
| ALL | `/mcp` | – | MCP JSON-RPC 2.0 tool execution endpoint (`search_messages`, `get_collections`, `get_message`, `get_etch_guide`) |
| GET | `/api/collections` | – | Collections with address/message counts |
| GET | `/api/messages?collection_id=&address=&category=&protocol=&tick=&block=&kind=text\|all&sort=hot\|new&limit=&before=` | – | Feed. Global feed defaults to `kind=text` (human messages); `kind=all` includes every decoded protocol |
| GET | `/api/protocols?days=30` | – | Distinct txs per protocol |
| GET | `/api/ticks?protocol=&days=30` | – | Token tickers by activity |
| GET | `/api/chain` | – | Block census (blocks scanned, OP_RETURN / Runes counts, recent blocks) |
| GET | `/api/block/:height` | – | One scanned block |
| GET | `/p/:protocol`, `/tick/:tick`, `/block/:height` | – | Explorer pages (SSR + markdown via `Accept: text/markdown`) |
| POST | `/api/like` | – | `{ "message_id": 1, "nonce": <mined> }` — requires a 16-bit PoW nonce + one vote per visitor |
| GET | `/api/health` | – | Health check |
| POST | `/api/admin/collections` | `X-Admin-Key` | Create collection |
| POST | `/api/admin/addresses` | `X-Admin-Key` | Add address `{ address, label, collection_id }` |
| GET | `/api/admin/addresses` | `X-Admin-Key` | List addresses |
| DELETE | `/api/admin/addresses/:id` | `X-Admin-Key` | Remove address |
| DELETE | `/api/admin/collections/:id` | `X-Admin-Key` | Remove collection |
| POST | `/api/admin/seed` | `X-Admin-Key` | (Re)seed from `collections.json` |
| POST | `/api/admin/reparse?max=` | `X-Admin-Key` | Re-derive protocol/ops for legacy rows now (the cron does this anyway) |
| POST | `/api/admin/details?max=` | `X-Admin-Key` | Fill sender/fee/recipient by txid for rows missing them |
| GET | `/api/admin/ingest/status` | `X-Admin-Key` | Cursors, tip, last error, block census |
| POST | `/api/admin/ingest/reset` | `X-Admin-Key` | `{ "height": 968900, "floor": 968000 }` — point the cursors |
| POST | `/api/admin/ingest/block/:height` | `X-Admin-Key` | Ingest one block now (cursors untouched) |
| POST | `/api/cron/run` | `x-cron-secret` | Manual poll (same as scheduled cron) |

## Tests & load test

```bash
npm test                                   # vitest: protocols, raw block parser, addresses
node scripts/loadtest-seed.mjs 400000      # seed local D1 with synthetic explorer rows
```

## Rollout of the explorer (migrations 0007/0008)

1. `npm run db:migrate:remote` — additive columns + `ops`, `blocks`, `ingest_state`.
2. `npm run deploy` (ships with `INGEST_FORWARD=1`, `INGEST_BACKFILL=1`), then run
   `curl -X POST -H 'x-admin-key: …' https://opreturn.xyz/api/admin/reparse?max=2000`
   so every legacy row gets its protocol immediately (the cron would do it in
   500-row steps anyway). The cron fills sender/fee/recipient (40/run) over the
   following hour; feed and collections keep working throughout.
3. Watch `GET /api/admin/ingest/status` (cursor should track the tip; `last_error` empty).
4. Set `INGEST_BACKFILL=1` and redeploy to walk back `BACKFILL_DAYS` (~1,000 blocks
   per week of history at 3 blocks per cron run, i.e. roughly a day per 30 days).

## UI layout

`src/ui.ts` is generated (stylesheet + inline client script + server shell); edit
the scratchpad sources and re-run the assembler rather than the file itself.
Feed-style screens (`/feed`, `/c/:slug`, `/a/:address`, `/p/:protocol`,
`/tick/:tick`, `/block/:height`, `/cat/:slug`) are rendered by **one** module,
`src/feedview.js`: the Worker imports it for the server-rendered page and the
assembler inlines the same file into the client script between
`/*__FEEDVIEW_START__*/` and `/*__FEEDVIEW_END__*/`. `test/feedview.test.ts`
evaluates the inlined copy and asserts it renders byte-identically to the
module, so server and client markup cannot drift; a Playwright pass
(scratchpad `feed-shift.mjs`) compares each page's element outline with
JavaScript off and on. The same module renders the message page (`/m/:txid`,
`detailHTML`) and the chat rooms (`/rooms`, `/c/:slug/chat`, `/a/:address/chat`,
`chatHTML`); a server-rendered room carries `data-scroll="bottom"` and the
client script jumps to the newest bubble before its first fetch. The fee's USD
figure is resolved before rendering on both sides through one edge-cached price
lookup (`price:<bucket>`), so the facts column does not reflow. The landing page
is rendered server-side in `src/seo.ts` and adopted by the client
(`data-ssr="about"`). Collection address cards are server-rendered only: after
in-app navigation to a collection they appear on the next full load.

## IndexNow

New human-message pages are announced to Bing, Yandex, Seznam and Naver through
the eco-wide IndexNow hub (`indexnow.kyc.rip`, a separate Worker in the same
Cloudflare account). The hub serves our key file, polls `/sitemap.xml` every
30 minutes for new URLs, and accepts pushes. Google does not use IndexNow.

- Secret `INDEXNOW_HUB_TOKEN` (site token issued by the hub) enables the push;
  vars `INDEXNOW_HUB_URL` and `INDEXNOW_HOST` are in `wrangler.jsonc`. Without
  the token the hook is a no-op.
- Every cron run (`src/indexnow.ts`, after classification) submits up to 200
  not-yet-pushed human-message representatives (`/m/<txid>`) plus the
  collection pages they landed in, then stamps `messages.indexnow_pushed_at`
  (migration 0009). A failed hub call is recorded and retried next run. The
  first run only sets `indexnow_bootstrap_id`: rows older than that are never
  pushed by the hook (the hub's sitemap watcher already covers the archive).
- Health: `GET /api/admin/ingest/status` shows `indexnow_last_ok`,
  `indexnow_last_error(_at)`, `indexnow_last_batch_urls`, `indexnow_bootstrap_id`. A
  partial accept (the hub's daily cap) stamps nothing and is retried.
- Manual: `POST /api/admin/indexnow` with `{ "urls": ["/learn/x", ...] }` or
  `{ "all": true }` proxies to the hub. `all` counts against the hub's daily
  cap of 2,000 URLs, so the cron's pushes may be refused for the rest of that
  day.
- The sitemap's `lastmod` values are real activity dates (newest op per
  protocol and ticker, newest message per collection, address and category);
  only `/`, `/feed` and `/rooms` carry today's date. The sitemap is served from
  a ten-minute edge-cached snapshot.

## Notes

- AI classification is best-effort: batches of `AI_BATCH_SIZE` (default 10)
  messages are sent in one request; any message the batch response missed is
  retried individually. Failures leave `category` NULL and the next cron run
  retries (capped by `AI_MAX_PER_RUN`; note that `0` means "use the default",
  not "off" — unset `OPENAI_API_KEY` to disable). Only dedupe-group
  representatives (`is_dup = 0`) are sent; collapsed duplicates inherit the
  label. Every request carries `x-opencode-session` and a `user-agent`, which
  OpenCode Zen Go requires (it returns 400 `MissingSessionID` otherwise).
  Classifier health is in `GET /api/admin/ingest/status` as `ai_last_ok`,
  `ai_last_error` and `ai_last_error_at`.
- The taxonomy has eleven labels (`CATEGORIES` in `src/classify.ts`); the
  prompt, the llms.txt taxonomy block and the FAQ are generated from it. To
  relabel the archive offline with Claude, run
  `node --experimental-strip-types scripts/reclassify.mts` (dry run, writes a
  JSONL with old and new labels), then `--apply <jsonl>`; `--revert <jsonl>`
  restores the previous labels. It needs `ADMIN_KEY` and `ANTHROPIC_API_KEY`
  in the environment or `.dev.vars`, and uses the admin endpoints
  `GET /api/admin/messages/text`, `POST /api/admin/categories` and
  `POST /api/admin/reparse?scope=text`.
- Likes require a client-mined proof-of-work nonce (16 leading zero bits of
  `sha256(message_id:nonce)`, verified server-side in `src/index.ts`), plus a
  voter fingerprint (hashed `CF-Connecting-IP` + User-Agent) that dedupes votes.
- Cron runs every 3 minutes (`*/3 * * * *` in `wrangler.jsonc`). Minimum
  supported interval on the Workers free tier is 1 minute.
