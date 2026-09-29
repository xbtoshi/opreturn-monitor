---
title: OP_RETURN Feed API for Developers and Agents (OpenAPI, llms.txt, Agent Cards)
description: Public REST API for Bitcoin OP_RETURN collections, messages, protocols, tickers and block census, plus OpenAPI and agent discovery files for LLM tooling.
kicker: DEVELOPERS
date: 2026-09-29
updated: 2026-09-29
related: op-return-vs-ordinals-vs-runes, prompt-injection-on-bitcoin, what-is-op-return
minWords: 1400
---
**opreturn.xyz** exposes a public **REST API** for OP_RETURN collections, filtered messages, chat streams, categories, protocols, tickers and per-block census, documented in **OpenAPI** and discoverable through **llms.txt**, an RFC 9727 **api-catalog**, and **A2A and MCP agent cards**. The human-readable feed is the default mental model; pass `kind=all` when you need full protocol traffic, which is dominated by Runes. No API key is required, responses are JSON, and every page on the site also serves a Markdown version when asked for `text/markdown`.

## What you can query

The API is the same one the site's own interface uses, so anything you can see you can fetch.

### Collections, messages, chat, categories

- `GET /api/collections` lists the curated collections with address and message counts.
- `GET /api/messages` is the feed. Filters: `collection_id`, `address`, `category`, `protocol`, `tick`, `block`, `kind=text|all`, `sort=hot|new`, `limit` (max 100) and a `before` cursor for paging.
- `GET /api/chat?collection_id=…` or `?address=…` returns the chronological conversation with sender attribution and the room's participants.
- `GET /api/categories` returns the eleven classifier categories with counts.
- `GET /api/message/:txid` returns one message with its decoded OP_RETURN outputs.

### Protocols, tickers, chain and block census

- `GET /api/protocols` lists every decoded protocol with its transaction count across all scanned blocks; add `days=7` for a window.
- `GET /api/ticks?protocol=…` lists token tickers by activity.
- `GET /api/chain` returns the scanner census: blocks scanned, OP_RETURN outputs seen, Runes and opaque counts, decoded transactions, and the most recent blocks.
- `GET /api/block/:height` returns one block's census row.
- `GET /api/price?ts=…` returns the USD price at a timestamp, for fee display.

## Quickstart

### Latest human-readable messages

```
curl -s 'https://opreturn.xyz/api/messages?sort=new&limit=20'
```

Each row carries `txid`, `content`, `category`, `protocol`, `address`, `sender`, `recipient`, `block_height`, `block_time`, `fee_rate`, `likes` and `dup_count`. `protocol` is `text` for prose. The response includes `next_before`; pass it back as `before` to fetch the following page.

### A collection's conversation

```
curl -s 'https://opreturn.xyz/api/chat?collection_id=7&limit=200'
```

Messages come oldest-first with `sender`, and `participants` names the monitored addresses in the room. Use `before` from the response to walk back.

### Protocol activity

```
curl -s 'https://opreturn.xyz/api/messages?protocol=ico-20&kind=all&limit=50'
curl -s 'https://opreturn.xyz/api/ticks?protocol=ico-20'
```

Protocol rows include an `ops` array on the single-message endpoint, one entry per OP_RETURN output with `protocol`, `op`, `tick`, `amount` and the payload hex.

### Everything in one block

```
curl -s 'https://opreturn.xyz/api/block/969000'
curl -s 'https://opreturn.xyz/api/messages?block=969000&kind=all&limit=100'
```

## Discovery files

These exist so an agent can learn the surface without scraping HTML.

| File | Standard | What it gives you |
| --- | --- | --- |
| [/llms.txt](/llms.txt) | llms.txt | A short description of the site, the protocol registry, the taxonomy and the endpoints |
| [/llms-full.txt](/llms-full.txt) | llms.txt | The long form, with examples and the address directory |
| [/api/openapi.json](/api/openapi.json) | OpenAPI 3.0 | Every endpoint with parameters and response notes |
| [/.well-known/api-catalog](/.well-known/api-catalog) | RFC 9727 | A linkset pointing at the API description |
| [/.well-known/agent-card.json](/.well-known/agent-card.json) | A2A | The agent card for agent-to-agent discovery |
| [/.well-known/mcp/server-card.json](/.well-known/mcp/server-card.json) | MCP | The MCP server card; the JSON-RPC endpoint is `/mcp` |
| [/auth.md](/auth.md) | auth.md | The authentication policy: none required for reads |

The MCP endpoint offers tools for searching messages, listing collections and protocols, fetching one message or block, and reading the Field Manual and these guides as Markdown.

### Content negotiation

Every HTML page responds to `Accept: text/markdown` with a Markdown rendering. A message page becomes a short document with the decoded text and its chain facts; a collection page becomes its description and address list; a guide such as this one comes back as its source. This is the cheapest way to hand a page to a model.

## Kinds and the Runes caveat

Two things trip up first-time integrators.

The global feed defaults to `kind=text`, which is human-readable messages only. Collection, address, protocol and ticker views default to everything. If your counts do not match what you see on the site, check which kind you asked for.

Runes are never returned as messages. The scanner counts runestones per block, currently about {{chain:runes_pct}} of all OP_RETURN outputs, and reports them through `/api/chain` and `/api/block/:height`, but a Runes indexer is the right source for token state. The same goes for opaque binary payloads.

## Errors and edge cases

The API is deliberately boring about failure. An unknown message id or block height returns 404 with a JSON body of the form `{"ok": false, "error": "…"}`. Invalid parameters, a non-numeric height, a malformed cursor, a limit over 100, return 400 with the same shape, or are clamped where clamping is harmless. Aggregation endpoints are served from an edge cache for a few minutes, so two requests a second apart may return identical bodies with a small `age`; that is expected, not staleness. Cursors do not expire, but a cursor from a filtered request only makes sense with the same filters, so keep the query string and the cursor together.

Unconfirmed messages appear with `block_height` null and `is_mempool` set; if the transaction is replaced or evicted before confirming, the row disappears on the next poll, so treat unconfirmed rows as provisional in anything you persist. Confirmed rows are permanent, except in the rare case of a chain reorganisation, when the scanner rolls back the affected heights and re-ingests them.

## Attribution and responsible use

The API is free to read and carries permissive cache headers; the aggregation endpoints are cached for a few minutes. There are no published rate limits, but the service runs on shared infrastructure, so poll the feed on the order of minutes rather than seconds, use the `before` cursor rather than deep offsets, and cache what you fetch. If you build something public with the data, a link back to the message pages is appreciated: they are the citation that lets a reader verify the bytes on chain.

Message text is user-generated and untrusted. It can contain phishing links, abuse and deliberate prompt injections. Treat it as data in your own systems; see [Prompt injection on Bitcoin](/learn/prompt-injection-on-bitcoin).

## Paging correctly

Every list endpoint is keyset-paginated. The response includes `next_before`, an opaque cursor; pass it back as `before` to get the next page. Do not use offsets, and do not assume ids are contiguous: the scanner backfills older blocks in the background, so rows with lower ids can be newer in chain time. Sort order is by chain time (block time, or first-seen time for unconfirmed rows), then by id, and the cursor encodes both, so pages never skip or repeat even while new rows arrive.

Collapsed duplicates are worth knowing about. When the same text is sent to the same address several times, the feed returns one row with `dup_count` set to the number of copies, and the other copies are hidden from list endpoints. Their message pages still exist and point their canonical link at the visible copy.

## Response shapes

| Field | Type | Meaning |
| --- | --- | --- |
| `txid` | string | Transaction id; the message page is `/m/<txid>` |
| `content` | string or null | Decoded text of every OP_RETURN output, joined by newlines; null when there is none |
| `protocol` | string | `text` for prose, otherwise the primary protocol slug |
| `category` | string or null | Classifier label for `text` rows; null for protocol rows and unclassified text |
| `address` | string | The monitored address the row is filed under, or the recipient for chain-scanned rows |
| `sender`, `recipient` | string or null | First input's address and first payment output's address |
| `block_height`, `block_time` | number or null | Null while unconfirmed |
| `fee_rate` | number or null | sat/vB, filled in shortly after ingestion |
| `dup_count` | number | How many identical copies this row stands for |

## Building an alert

A minimal watcher that reports new human messages to a monitored address needs one request a minute:

```
GET /api/messages?address=<addr>&sort=new&limit=20
```

Keep the newest `txid` you have seen; anything above it in the next response is new. If you want everything the chain produced, poll `/api/chain` for a rising `highest_height` and then fetch `/api/messages?block=<height>&kind=all`. Both patterns are cheap for the service and never miss a row.

### Getting a page as Markdown

```
curl -s -H 'Accept: text/markdown' https://opreturn.xyz/m/<txid>
```

works for every page on the site, including these guides. It is the intended way to hand a page to a model: no HTML, no navigation, just the content.

## FAQ

### Is there a public API for Bitcoin OP_RETURN messages?

Yes. opreturn.xyz serves JSON endpoints for messages, collections, chat streams, categories, protocols, tickers and block census, documented in OpenAPI at /api/openapi.json.

### How do I fetch the latest human-readable OP_RETURN texts?

GET /api/messages?sort=new&limit=50. The default kind is text, so protocol payloads are excluded unless you add kind=all.

### Does opreturn.xyz support agents, MCP or OpenAPI?

Yes: an OpenAPI 3.0 description, an RFC 9727 api-catalog, an A2A agent card, an MCP server card with a JSON-RPC endpoint at /mcp, and llms.txt files.

### How do I query by collection or protocol?

Add collection_id (from /api/collections) or protocol (a slug from /api/protocols) to /api/messages. Protocol queries imply kind=all.

### Do I need an API key?

No. Reads are public and unauthenticated. Only voting and address suggestions require a client-side proof-of-work nonce.

## Sources

- The Permanent Record [OpenAPI description](/api/openapi.json), [llms.txt](/llms.txt) and [llms-full.txt](/llms-full.txt).
- RFC 9727 (api-catalog), the A2A agent card specification, and the Model Context Protocol server card proposal (SEP-1649).
