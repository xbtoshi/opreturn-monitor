---
title: Bitcoin OP_RETURN Explorer — Search & Read On-Chain Messages
description: Search and explore Bitcoin OP_RETURN messages, protocols, and on-chain data. Browse live transmissions, search message text, or query the free public API.
kicker: EXPLORER
date: 2026-10-05
updated: 2026-10-05
related: what-is-op-return, op-return-api-for-agents, op-return-vs-ordinals-vs-runes
minWords: 900
---
Search and explore Bitcoin OP_RETURN messages, protocols, and on-chain data. Browse the latest OP_RETURN transactions, search message text, inspect individual transactions, or query the public API.

## What is a Bitcoin OP_RETURN explorer?

A Bitcoin OP_RETURN explorer finds and displays the data people embed in Bitcoin through `OP_RETURN` outputs (opcode `0x6a`): readable messages, protocol payloads, and the chain facts around them. A generic block explorer shows the same output as a line of hex. An OP_RETURN explorer decodes it, keeps the human messages front and centre, and tells you which protocol produced the rest.

The Permanent Record is that explorer for the whole chain. It scans every block, decodes every OP_RETURN output, and stores the human-readable transmissions alongside {{protocols}} decoded protocols. So far it has scanned {{chain:blocks}} blocks and decoded {{chain:stored}} OP_RETURN transactions, and the numbers on this page are read live from the archive.

## Search and read Bitcoin OP_RETURN messages

The [live feed](/feed) lists the newest human-readable OP_RETURN messages from every block, with protocol traffic hidden by default. Each row opens a message page with the decoded text, the address it was sent to, the transaction id, the block height and time, and the fee paid. Switch to **kind = all** when you want full protocol traffic rather than only messages.

To search Bitcoin OP_RETURN data, type into the **Search messages** box in the sidebar or the search field on this page. The query opens `/feed?q=…` and filters within the currently loaded feed page, in your browser. It is a quick way to find a phrase in recent transmissions; it is not a full-archive text index, and the API has no `q` parameter today.

Bitcoin on-chain messages also cluster around a few addresses that turned into public bulletin boards. The [collections](/collections) group those addresses by the incident behind them, from hack negotiations to dormant-wallet notices and Genesis tributes, and every collection has a [chat room](/rooms) view that reads the messages as a conversation.

## How to read OP_RETURN messages on Bitcoin

1. Open the [feed](/feed), a [collection](/collections), or a message page at `/m/{txid}`. The decoded UTF-8 text is shown when the payload is readable; protocol fields are shown when the payload is a known protocol.
2. Check the category label. Every human message is classified by an AI model into categories such as threats, pleas, prompt injection, or graffiti, so you can skim a board without reading every line.
3. Follow the address link to see every message that address has sent or received, or the block link to see the full OP_RETURN census for that block.
4. Read the decoded outputs list. When a transaction carries more than one OP_RETURN output, the message page lists each one by vout with the protocol it was decoded as, and the transaction id links out so you can check the raw bytes in any block explorer.

If you are new to the opcode, start with the primer on [what an OP_RETURN message is and why it cannot be deleted](/learn/what-is-op-return).

## Protocols, boards, and the live feed

Human messages are a small slice of OP_RETURN traffic. Most outputs are Runes runestones, which the explorer counts per block but does not display, and much of the rest is token protocols and bridge or sidechain markers. The [protocol index](/protocols) shows every decoded protocol with its transaction count, and each protocol has its own page with the latest transactions.

- **Protocol pages**: `/p/{protocol}` for ico-20, crc-20, omni, thorchain, rootstock, stacks, and the rest.
- **Ticker pages**: `/tick/{TICK}` for token tickers seen in JSON mint and transfer ops.
- **Block pages**: `/block/{height}` for one block's OP_RETURN census: outputs seen, Runes share, binary payloads, and the stored transactions.
- **Category pages**: `/cat/{category}` for every message of one AI category.

Together these make the explorer a map of OP_RETURN usage rather than a list of transactions. The [Protocols](/protocols) page and the [Learn guides](/learn) explain how each protocol is detected.

## Bitcoin OP_RETURN API — free, no API key

Everything on this site is also available as JSON through a public REST API, free to read, with no API key for reads. `GET /api/messages` returns the feed with the same filters the UI uses (collection, address, category, protocol, ticker, kind, cursor). `GET /api/protocols`, `/api/ticks`, `/api/chain`, and `/api/block/:height` expose the census. The API is documented in [OpenAPI](/api/openapi.json) and described for agents in `llms.txt`, an api-catalog, and A2A and MCP cards.

Start with the [OP_RETURN API guide for developers and agents](/learn/op-return-api-for-agents). It covers pagination with cursors, polling etiquette, and how to fetch any page on the site as Markdown by sending `Accept: text/markdown`.

## FAQ

### What is a Bitcoin OP_RETURN explorer?

A tool that finds and displays data people embed in Bitcoin via OP_RETURN (opcode 0x6a) outputs: readable messages, protocol payloads, and related chain facts, instead of only showing raw hex in a generic block explorer.

### How do I read OP_RETURN messages?

Open the [live feed](/feed), a [collection board](/collections), or a message page at `/m/{txid}`. Decoded text and protocol fields are shown when present. For the background, read the primer on [what OP_RETURN is](/learn/what-is-op-return).

### Can I search Bitcoin OP_RETURN data on opreturn.xyz?

Yes. Use the **Search messages** box; it opens `/feed?q=…` and filters within the currently loaded feed page, in your browser. There is no separate search URL and no `q` parameter on `/api/messages` today.

### Is the Bitcoin OP_RETURN API free? Do I need an API key?

Yes, it is free to read, and no API key is needed for reads. Reads are anonymous and unauthenticated, as stated in the site's `auth.md` and in the [API guide](/learn/op-return-api-for-agents); the OpenAPI document declares no security schemes. Votes and address suggestions use a small client-side proof of work, not a developer key.

### Are there rate limits?

There is no published numeric quota for reads. Responses are cached at the Cloudflare edge with stale-while-revalidate, and the docs ask agents to poll on the order of minutes, use cursors, and cache results rather than hammer the API.

### Does this index Ordinals inscriptions?

No. Ordinals inscriptions live in witness data, not OP_RETURN. This explorer indexes OP_RETURN human text and decoded OP_RETURN protocols; Runes runestones are counted in the block census but not returned as message rows. See [OP_RETURN vs Ordinals vs Runes](/learn/op-return-vs-ordinals-vs-runes).

### How is this different from mempool.space or Blockchair?

Those are general-purpose transaction explorers. The Permanent Record is built around the data inside OP_RETURN outputs: bulletin-board collections, AI categories, a protocol census, chat-room views, and a message-oriented API with agent discovery files.

### Is "OP_REUTRN explorer" the same thing?

Yes. People sometimes misspell the opcode as OP_REUTRN when looking for an OP_RETURN explorer; it is the same opcode and the same product.
