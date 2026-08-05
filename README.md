# Bitcoin OP_RETURN Message Monitor

Serverless monitor for OP_RETURN messages sent to selected Bitcoin addresses.
Built on **Cloudflare Workers + Hono + TypeScript + D1**, with AI classification
via any OpenAI-compatible endpoint and a small single-page web UI.

- Polls addresses (confirmed + mempool) every 3 minutes via `mempool.space`
  (with `www.mempool.space` and `blockstream.info` fallbacks).
- Decodes OP_RETURN output scripts to UTF-8 and stores unique messages (dedup by txid).
- Classifies messages into 7 categories with an OpenAI-compatible API.
- Groups addresses into **Collections**; users can **like** messages and sort by
  **Hottest** or **Newest**.
- Seed collections/addresses live in `collections.json`.

## Project layout

```
├── collections.json        # Seed data (single source of truth)
├── migrations/0001_init.sql# D1 schema
├── wrangler.toml           # Worker config + cron trigger
└── src/
    ├── index.ts            # Hono app: public + admin routes, worker entry
    ├── cron.ts             # Poll → extract → insert → classify pipeline
    ├── db.ts               # D1 query helpers
    ├── mempool.ts          # mempool.space client + OP_RETURN decoder
    ├── classify.ts         # OpenAI-compatible chat/completions wrapper
    ├── seed.ts             # ensureSeeded() using collections.json
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

`wrangler.toml` holds non-secret vars (`OPENAI_MODEL`, `OPENAI_API_BASE`,
`MEMPOOL_BASE_URL`, `AI_MAX_PER_RUN`, `AI_DELAY_MS`, `AI_BATCH_SIZE`,
`CRON_SECRET`, `ADMIN_KEY`).

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
| GET | `/` | – | Web UI |
| GET | `/api/collections` | – | Collections with address/message counts |
| GET | `/api/messages?collection_id=&sort=hot\|new&limit=&before=` | – | Message feed |
| POST | `/api/like` | – | `{ "message_id": 1 }` — one vote per visitor |
| GET | `/api/health` | – | Health check |
| POST | `/api/admin/collections` | `X-Admin-Key` | Create collection |
| POST | `/api/admin/addresses` | `X-Admin-Key` | Add address `{ address, label, collection_id }` |
| GET | `/api/admin/addresses` | `X-Admin-Key` | List addresses |
| DELETE | `/api/admin/addresses/:id` | `X-Admin-Key` | Remove address |
| DELETE | `/api/admin/collections/:id` | `X-Admin-Key` | Remove collection |
| POST | `/api/admin/seed` | `X-Admin-Key` | (Re)seed from `collections.json` |
| POST | `/api/cron/run` | `x-cron-secret` | Manual poll (same as scheduled cron) |

## Notes

- AI classification is best-effort: batches of `AI_BATCH_SIZE` (default 10)
  messages are sent in one request; any message the batch response missed is
  retried individually. Failures leave `category` NULL and the next cron run
  retries (capped by `AI_MAX_PER_RUN`).
- Likes use a voter fingerprint (hashed `CF-Connecting-IP` + User-Agent).
- Cron runs every 3 minutes (`*/3 * * * *` in `wrangler.toml`). Minimum
  supported interval on the Workers free tier is 1 minute.
