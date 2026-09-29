---
title: OP_RETURN vs Ordinals vs Runes: What The Permanent Record Actually Indexes
description: Ordinals live in witness space, Runes use OP_RETURN runestones, and text boards are something else again. See how opreturn.xyz separates protocols, tickers and human messages.
kicker: COMPARISON
date: 2026-09-29
updated: 2026-09-29
related: what-is-op-return, bitcoin-core-30-op-return-datacarriersize, op-return-api-for-agents
minWords: 1400
---
**Ordinals inscriptions** embed data in **witness** space, not in OP_RETURN. **Runes** encode their protocol messages, called runestones, in **OP_RETURN** outputs and account for the large majority of all OP_RETURN traffic. **The Permanent Record** scans every OP_RETURN output on the chain, decodes the protocols it recognises into pages for each protocol, ticker and block, counts Runes and opaque payloads toward the census without storing them as messages, and sends only human-readable text through its AI classifier. The feed defaults to that text; ask for all kinds and you get the protocol traffic too.

## Three different jobs

"Data on Bitcoin" covers at least three unrelated mechanisms, and headlines mix them up constantly.

### Ordinals and inscriptions: witness data

An inscription is arbitrary content, an image, text or a file, stored in the witness part of a taproot spend using an envelope of `OP_FALSE OP_IF … OP_ENDIF`. The witness discount makes this the cheapest place per byte to put large data. The Ordinals protocol then assigns that content to a specific satoshi by numbering sats in order of creation, which is how an inscription becomes a transferable "NFT". None of this touches OP_RETURN. An OP_RETURN scanner does not see inscriptions at all.

### Runes: OP_RETURN runestones

Runes is a fungible token protocol. Every etch, mint and transfer is a transaction with an OP_RETURN output whose script begins `OP_RETURN OP_13` followed by a compact binary payload. The token state, who holds how many of which rune, is not on chain in any explicit form; indexers reconstruct it by replaying every runestone in order. Because Runes is popular and every transfer needs one, runestones dominate OP_RETURN by count. On this explorer they are about {{chain:runes_pct}} of everything.

### Arbitrary text and protocol memos

The third category is everything else that rides in OP_RETURN: plain messages from people, JSON token operations such as the `ico-20` and `crc-20` mints sent to the Genesis address, Omni Layer transfers, THORChain and bridge memos, merged-mining commitments from Rootstock and Stacks, and files embedded as data URIs. There is no single protocol here, which is why this site maintains a registry of the ones it can decode.

| | Where the data lives | Typical size | Who indexes it | What this site does |
| --- | --- | --- | --- | --- |
| Ordinals inscriptions | Taproot witness | KB to MB | `ord` and marketplace indexers | Not scanned; different data path |
| Runes | OP_RETURN (OP_13 runestone) | Tens of bytes | Runes indexers | Counted per block, never shown as text |
| BRC-20 | Inscription JSON (witness) | ~100 bytes | Ordinals-based indexers | Not scanned |
| Text and memos | OP_RETURN | Bytes to a few KB | This site, some explorers as hex | Decoded, classified, archived |
| Token JSON (ico-20, crc-20, nft…) | OP_RETURN | ~50 to 200 bytes | Protocol-specific | Decoded into protocol and ticker pages |

## UTXO and pruning implications

The mechanisms differ in what they cost the network long term. OP_RETURN outputs are provably unspendable and dropped from the UTXO set immediately; they cost block space once and nothing after. Witness data is discounted at consensus level and also does not enter the UTXO set, but the inscribed satoshi does, and the practice of tracking specific sats keeps small outputs alive. Older data-embedding tricks that hide bytes in fake addresses create unspendable outputs every node must remember forever, which is the outcome OP_RETURN was designed to prevent.

Relay policy is separate again. Bitcoin Core 30.0 raised the default OP_RETURN data-carrier limit to 100,000 bytes and allowed multiple OP_RETURN outputs per transaction; witness data was never subject to that limit. Details in [Bitcoin Core 30 OP_RETURN changes explained](/learn/bitcoin-core-30-op-return-datacarriersize).

## What The Permanent Record scans

### Every block's OP_RETURN outputs

The scanner downloads each new block, parses it, and decodes every output whose script starts with OP_RETURN. It has processed {{chain:blocks}} blocks so far and seen {{chain:outputs}} OP_RETURN outputs. Monitored addresses are also polled every three minutes, which is how unconfirmed messages reach the collection chat rooms before a block does.

### The kinds it recognises

The registry currently decodes {{protocols}} protocols. In rough order of volume: Runes (counted only), JSON token operations (`ico-20`, `crc-20`, `brc-20`-style, `nft`), THORChain memos (`OUT:`, `REFUND:` and swap instructions), cross-chain bridge memos, bare EVM hashes, LI.FI markers, Omni Layer, merged-mining tags from Rootstock, Stacks, Core DAO, exSat and Syscoin, inline files as data URIs, and plain text. Payloads that match none of these and are not readable text are counted as opaque binary.

### The Runes caveat

Because runestones are binary and only meaningful to a Runes indexer, storing each one as a "message" would make the archive unreadable and multiply its size by fifty for no benefit. So they are counted per block, shown in the chain census and on each block page, and otherwise excluded. Anyone who needs Runes token state should use a Runes indexer; this site is not one.

## How to navigate

- [`/protocols`](/protocols) lists every decoded protocol with its transaction count across all scanned blocks.
- [`/p/ico-20`](/p/ico-20), for example, shows every transaction carrying that protocol, its most active tickers and a raw example payload.
- [`/tick/LEAF`](/tick/LEAF) collects every operation for one ticker across protocols.
- `/block/<height>` shows one block's census: how many outputs were Runes, opaque, protocol data, tokens and human messages, plus the archived transactions from that block.
- The [feed](/feed) shows human text by default; the "All protocols" switch, or `kind=all` on the API, includes everything the registry decoded.

For developers the same views exist as JSON. See [the API guide](/learn/op-return-api-for-agents).

## Why the distinction matters for readers

Confusing the three mechanisms leads to wrong conclusions in both directions. Someone who reads that "OP_RETURN traffic exploded" and pictures a wave of messages is looking at Runes, which are machine-to-machine token accounting and contain nothing to read. Someone who reads that inscriptions "fill blocks with JPEGs" and expects to find them on an OP_RETURN explorer will find nothing, because that data lives in witness space and never passes through this site's scanner. And someone who dismisses OP_RETURN as "just tokens" misses the human traffic entirely: the negotiation boards, the notices, the tributes and the graffiti that are the reason this archive exists.

The practical rule is to ask where the bytes are and who is meant to read them. Witness data is for indexers of a specific protocol. Runestones are for Runes indexers. Text in OP_RETURN is for people, and it is the only category that a general-purpose reader can make sense of without a protocol specification in hand.

## What one block looks like

A block page makes the split concrete. Open any recent block from the [latest blocks list](/feed) and the census bar shows how its OP_RETURN outputs divide: a wide Runes segment, a sliver of opaque binary, a band of decoded protocol operations, a thinner band of token JSON, and, usually smallest of all, the human messages. Below the bar are the archived transactions from that block, with the human ones first when you filter to Messages. Across the {{chain:blocks}} blocks scanned so far the proportions are stable enough that the feed's default, human text only, is the only setting under which the site reads like a message board rather than a token ledger.

## FAQ

### Do Ordinals use OP_RETURN?

No. Inscriptions store their content in taproot witness data using a script envelope. An OP_RETURN scanner never sees them.

### Do Runes use OP_RETURN?

Yes. Every Runes operation is an OP_RETURN output beginning with OP_13, called a runestone. They are the single largest source of OP_RETURN outputs on the chain.

### Why are most OP_RETURN outputs Runes?

Because a fungible token protocol generates one output per transfer, and Runes has been heavily used since 2024. On this explorer runestones are about {{chain:runes_pct}} of all OP_RETURN outputs.

### What does opreturn.xyz store versus count?

It stores transactions whose OP_RETURN decodes as text or as a recognised protocol, with a page per transaction. It counts Runes and opaque binary payloads per block without storing them as messages.

### Where is BRC-20 in this model?

BRC-20 lives inside inscriptions, so it is witness data and outside this site's scope. Its OP_RETURN-based cousins, the JSON token ops such as ico-20 and crc-20, are decoded and get protocol and ticker pages.

## Sources

- The Ordinals handbook on inscriptions and the witness envelope; the Runes specification on runestones and OP_13.
- [Bitcoin Core 30.0 release notes](https://bitcoincore.org/en/releases/30.0/) on data-carrier policy.
- The Permanent Record [protocol index](/protocols), [chain census API](/api/chain) and [llms.txt](/llms.txt), which document what is decoded versus counted.
