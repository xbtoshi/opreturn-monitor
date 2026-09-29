---
title: What Is an OP_RETURN Message in Bitcoin? Can It Be Deleted?
description: OP_RETURN (opcode 0x6a) embeds data in a provably unspendable Bitcoin output. Once confirmed, it cannot be deleted. See how The Permanent Record archives live messages.
kicker: FUNDAMENTALS
date: 2026-09-29
updated: 2026-09-29
related: bitcoin-core-30-op-return-datacarriersize, how-to-etch-op-return, op-return-vs-ordinals-vs-runes
minWords: 1300
---
An **OP_RETURN** output uses Bitcoin Script opcode `0x6a` to mark a transaction output as provably unspendable while embedding arbitrary data in it. Nodes can drop the output from the UTXO set immediately, so it causes no lasting bloat, while the bytes remain in the blockchain's history. **No**: once the transaction is confirmed in a block, the message cannot be altered, deleted or centrally censored without rewriting Bitcoin's proof-of-work history.

## Plain-language definition

Every Bitcoin transaction has outputs, and every output has a small script that says who may spend it. Usually that script says "whoever can sign for this key". An OP_RETURN output's script says something different: "nobody, ever". Immediately after that instruction it can carry a chunk of data.

Because the script begins with `OP_RETURN`, any attempt to spend the output fails before the data is even looked at. The data is therefore a passenger. It rides inside a valid transaction, gets mined into a block like everything else, and stays there.

People use this to write text, commit to a hash, publish a signature, or run entire protocols on top of Bitcoin. On this site the payload is usually a sentence someone wanted the world, or one specific address, to read.

## How the opcode works

In the raw script, an OP_RETURN output looks like `6a` followed by a push of the data bytes. For a short message that is `6a` + a one-byte length + the UTF-8 text. Longer payloads use `OP_PUSHDATA1` or `OP_PUSHDATA2` for the length. A single transaction can contain several of these outputs, and the archive decodes each one separately.

### Provably unspendable, so pruned from the UTXO set

Full nodes keep a set of all unspent outputs in memory and on fast storage, because they need it to validate every new transaction. Payment outputs sit in that set until spent, which can be years. An OP_RETURN output is provably unspendable, so a node never needs to remember it; it is excluded from the UTXO set the moment the block is processed. This is why OP_RETURN is the sanctioned way to embed data: the alternative tricks, such as hiding bytes in fake addresses, create outputs nobody can spend but every node must remember forever.

## Permanence and censorship resistance

Deleting an OP_RETURN message would mean removing a confirmed transaction from a block. Bitcoin blocks are chained by proof of work: each block's header commits to the previous block, and each block commits to its transactions through a Merkle root. To change one transaction you would have to re-mine that block and every block after it, faster than the rest of the network extends the chain. No company, government or node operator can do that. That is not a policy stance, it is the security property the currency itself depends on.

Two consequences follow. A message cannot be retracted, corrected or taken down, even by its author. And a message cannot be blocked from existing once mined; it can only be ignored by software that chooses not to display it.

The practical rule for anyone considering writing one: assume it will be readable by everyone, forever, and linkable to the address that paid for it.

## Size and policy

How much data fits is a question of relay policy rather than consensus. For a decade the default Bitcoin Core node relayed at most 80 bytes of OP_RETURN data. Since Bitcoin Core 30.0 (October 2025) the default is 100,000 bytes, effectively uncapped, and multiple OP_RETURN outputs per transaction relay too. The details, the history and the revert flag are covered in [Bitcoin Core 30 OP_RETURN changes explained](/learn/bitcoin-core-30-op-return-datacarriersize).

Cost is the real limit. Every byte competes for block space and pays the going fee rate. A tweet-length note costs a few hundred sats on a quiet day; a kilobyte of PGP armour costs several thousand.

## What people use it for

Across the chain the overwhelming majority of OP_RETURN outputs are not messages at all. They are protocol payloads: Runes token operations, Omni Layer transfers, THORChain swap memos, bridge instructions, and commitments from merged-mined sidechains. The Permanent Record decodes {{protocols}} such protocols and counts Runes separately, because they make up roughly {{chain:runes_pct}} of all OP_RETURN outputs.

The human-readable minority is what this site is about. Some recurring uses:

- Public bulletin boards on addresses tied to hacks and thefts, where victims, opportunists and onlookers all write to the same place. See the [Coldcard exploit board](/learn/coldcard-exploit-bulletin-board).
- Legal notices and phishing aimed at dormant high-value wallets. See [dormant-wallet notices](/learn/dormant-wallet-op-return-notices).
- Tributes to Satoshi at the Genesis address, and memorials generally.
- Signed and encrypted negotiation between a security team and whoever holds disputed funds, as on the Liquid Network peg-out board.
- Jokes, haiku, proposals, and text written to confuse AI agents.

## See real messages

The [feed](/feed) shows the newest human-readable messages from every block, with protocol traffic hidden by default. The [collections](/collections) group addresses by the phenomenon behind them. Every message has a permanent page at `/m/<txid>` that decodes the payload, lists the block and fee, and links to the transaction on a public block explorer so anyone can verify it. For an example that carries three OP_RETURN outputs in one transaction, including an inline image, see [this NFT mint](/m/266f9f90960a895a1166b7dd7d4667d63e965c19f0a60084bd3072d7df89e381).

## Before you etch

Everything above cuts both ways. Permanence is the feature that makes a tribute meaningful and the reason a moment of anger becomes a permanent record. Before writing, read the [Field Manual](/guide): never include private keys or seed phrases, never include anything that identifies another person without their consent, and assume the sending address will be associated with the text for as long as Bitcoin exists.

## What it looks like in a raw transaction

For the curious, here is the output script of a short message as it appears in the transaction bytes:

```
6a 14 676d2c207065726d616e656e74207265636f7264
```

`6a` is OP_RETURN. `14` is the push length, 20 bytes. The rest is the message, `gm, permanent record`, as UTF-8. A block explorer shows exactly this as hex; the archive decodes it, checks whether it reads as text or matches a known protocol, and files it accordingly. The live encoder on the [Field Manual](/guide) page produces the hex for any text you type, so you can see your own message in this form before you send it.

## FAQ

### What is OP_RETURN in Bitcoin?

A script opcode (0x6a) that marks a transaction output as unspendable and lets it carry arbitrary data. It is the standard way to embed data in a Bitcoin transaction without bloating the UTXO set.

### Can an OP_RETURN message be deleted or edited?

No. Once the transaction is confirmed, the data is part of a block secured by proof of work. Changing it would require re-mining that block and every block after it.

### Does OP_RETURN bloat the UTXO set?

No. Because the output is provably unspendable, nodes drop it from the UTXO set immediately. It occupies block space in the archival chain, which the sender paid for, and nothing else.

### How much data can an OP_RETURN hold?

Consensus does not set a specific limit. Default relay policy allowed 80 bytes of data until Bitcoin Core 30.0 raised the default to 100,000 bytes in October 2025. Fees are the practical constraint.

### Who can read the messages?

Anyone. The data is public in every full node's copy of the chain. Sites like this one decode it into readable text; a block explorer shows the same bytes as hex.

## Sources

- Bitcoin Script reference for `OP_RETURN` (opcode 0x6a) and the standard data-carrier output type.
- [Bitcoin Core 30.0 release notes](https://bitcoincore.org/en/releases/30.0/) for current relay policy.
- Bitcoin Core 0.9.0 release notes, which introduced the 40-byte data-carrier default and explained the UTXO rationale.
- Live examples on The Permanent Record [feed](/feed) and [collections](/collections).
