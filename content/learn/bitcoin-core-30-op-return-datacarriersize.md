---
title: Bitcoin Core 30 OP_RETURN Changes Explained: datacarriersize, Policy vs Consensus
description: Bitcoin Core 30.0 raised the default -datacarriersize to 100,000 and allows multiple OP_RETURN outputs. Here is the precise policy change, and what it means for on-chain messages.
kicker: PROTOCOL POLICY
date: 2026-09-29
updated: 2026-09-29
related: what-is-op-return, how-to-etch-op-return, op-return-vs-ordinals-vs-runes
minWords: 1600
---
Bitcoin Core 30.0, released on 10 October 2025, increased the default `-datacarriersize` from 83 to 100,000 bytes, which effectively uncaps OP_RETURN data because the transaction size limit is reached first, and began relaying and mining transactions that contain multiple OP_RETURN outputs. Operators can restore the previous behaviour with `-datacarriersize=83`. These are relay and mining policy settings, not consensus rules: a block containing a large OP_RETURN was always valid, what changed is whether default nodes pass the transaction along before it is mined.

## Short answer: policy, not consensus

Two different rulebooks govern a Bitcoin transaction. **Consensus rules** decide whether a block is valid; every node enforces them, and breaking them forks you off the network. **Policy rules** decide which unconfirmed transactions a node is willing to keep in its mempool and relay to peers. Policy is local, configurable, and differs between implementations.

OP_RETURN size limits have always lived in the second rulebook. There was never a consensus limit on how much data an OP_RETURN output may carry beyond the general limits on script and transaction size. Bitcoin Core 30.0 changed a default in the policy rulebook. It did not change what a valid block is.

## What Core 30.0 changed

The release notes are short and precise, so it is worth quoting what they actually say rather than the headlines.

### Default `-datacarriersize` raised to 100,000

The notes state that `-datacarriersize` "is increased to 100,000 by default, which effectively uncaps the limit (as the maximum transaction size limit will be hit first)". The previous default was 83 bytes, which allowed an 80-byte payload plus the opcode and push bytes.

### Multiple OP_RETURN outputs permitted

"Multiple data carrier (OP_RETURN) outputs in a transaction are now permitted for relay and mining." Before 30.0, default nodes rejected a transaction with more than one OP_RETURN output as non-standard, even though such transactions were consensus-valid and did get mined when submitted directly to miners.

### Aggregate size semantics

The limit "applies to the aggregate size of the scriptPubKeys across all such outputs in a transaction, not including the scriptPubKey size itself". In plain terms: the data across all of a transaction's OP_RETURN outputs is added together and compared against the limit once.

### How to revert

Node operators who preferred the old behaviour can set `-datacarriersize=83` in `bitcoin.conf` or on the command line. That restores the previous relay limit on that node only. Neighbouring nodes with default settings will still relay larger payloads, so the effect is local.

| Setting | Before 30.0 | From 30.0 |
| --- | --- | --- |
| Default `-datacarriersize` | 83 bytes | 100,000 bytes |
| Multiple OP_RETURN outputs relayed | No | Yes |
| How the limit is measured | Single output | Aggregate across outputs |
| Consensus impact | None | None |
| Revert option | n/a | `-datacarriersize=83` |

## A brief history of standardness caps

Early Bitcoin had no formal policy for data outputs, and people embedded data in fake public keys and addresses, which bloated the UTXO set because those outputs could never be pruned. OP_RETURN was formalised as the "proper" way to carry data precisely because a provably unspendable output can be dropped from the UTXO set the moment it is created.

Core 0.9 (2014) relayed OP_RETURN payloads of up to 40 bytes. Core 0.12 (2016) raised the default to 80 bytes of data, 83 including the opcode and push. That 80-byte figure became folklore, and many explainers still describe it as "the OP_RETURN limit". It was always a default relay setting, and it stayed unchanged for almost a decade until 30.0.

### Why the UTXO-prune design mattered

The reason OP_RETURN is tolerated at all is that it does not cost full nodes anything after the block is stored. A payment output must be remembered until it is spent; an OP_RETURN output is forgotten immediately. Raising the size default does not change that property. A 50-kilobyte OP_RETURN costs the sender roughly 50 kilobytes of block space at the going fee rate, and it costs everyone else the same archival storage as any other 50 kilobytes of block.

## What did not change

- Consensus validity. Large OP_RETURN transactions were valid before and are valid now.
- Block space economics. Bytes still cost fees, and miners still prefer higher fee rates.
- Node operator choice. Every operator can run a stricter policy. Bitcoin Knots, for example, ships different defaults, and nodes running it will not relay what a default Core node relays. A transaction only needs one path to a miner, so a stricter minority does not prevent confirmation; it just refuses to help.
- The witness path. Ordinals inscriptions embed data in witness space, not in OP_RETURN, and were never subject to `-datacarriersize`. See [OP_RETURN vs Ordinals vs Runes](/learn/op-return-vs-ordinals-vs-runes).

## Implications for people who write and read messages

### Larger payloads and fees

A message no longer has to fit in 80 bytes. Multi-kilobyte text, PGP-armoured messages, and small images as data URIs now relay on default nodes. We see all of these in the archive: the [Liquid Network peg-out board](/c/liquid-network-peg-out-bulletin-board/chat) carries signed and encrypted messages that would never have fit before, and the explorer renders inline PNGs etched as `data:image/png;base64,…`. The cost scales linearly. At 5 sat/vB a 2,000-byte message is roughly 10,000 sats on top of the base transaction.

### Relay is not guaranteed

Because policy is local, a large OP_RETURN can sit in some mempools and be absent from others. If a transaction is not confirming, the usual suspects are a low fee rate or a path through nodes with the old limit. Submitting to a miner's or a public accelerator's endpoint routes around the second problem.

### What an archive has to handle

For The Permanent Record the change meant three concrete things. First, one transaction can carry several OP_RETURN outputs, so a message page shows every decoded output, not just the first. Second, payloads are large enough to hold structured protocol data, which is why the site runs a protocol registry before the AI classifier ever sees a byte. Third, the census numbers grew: the scanner has processed {{chain:blocks}} blocks and seen {{chain:outputs}} OP_RETURN outputs, of which about {{chain:runes_pct}} are Runes protocol messages that are counted but never shown as text.

## Checking what your own node relays

You do not have to take a release note's word for it. Two commands show the policy your node actually applies.

```
bitcoin-cli getmempoolinfo
```

prints the mempool's minimum fee and, on recent versions, the effective data-carrier settings. To test a specific transaction without broadcasting it, build it as described in the [Field Manual](/guide) and run

```
bitcoin-cli testmempoolaccept '["<signed-hex>"]'
```

The response says `allowed: true` or names the rejection reason. On a node with the old limit a 200-byte OP_RETURN fails with a `datacarrier` or `scriptpubkey` reason; on Bitcoin Core 30 with defaults it passes. If you want your node to keep the old behaviour, add `datacarriersize=83` to `bitcoin.conf` and restart. Note that this only changes what your node relays and mines: it will still accept and store any block that contains larger payloads, because that is consensus.

## A worked example of the cost

Suppose you want to etch a 2,000-byte PGP-signed statement, the kind that appears on the Liquid Network board. Before Core 30 you would have had to split it into 25 separate 80-byte transactions, or submit it directly to a miner, or find a node that relayed non-standard transactions. Now it is one transaction.

The OP_RETURN output adds roughly 2,010 virtual bytes to the transaction: the data, a three-byte push prefix for anything over 255 bytes, and the output header. Add a taproot input of about 58 vB and a change output of 43 vB and the transaction is about 2,120 vB. At 3 sat/vB that is roughly 6,400 sats; at 30 sat/vB it is 64,000. The fee scales with size exactly as it does for any other transaction, which is the whole point: the change did not make data cheaper, it made it possible to pay for in one piece.

## How other implementations differ

Bitcoin Core is not the only node software, and this is one of the places where implementations visibly diverge. Bitcoin Knots, a fork that tracks Core but ships different defaults, kept the tighter data-carrier limit and added further filters for what it considers spam. A node running Knots with default settings will not relay a large OP_RETURN that a default Core node relays.

That is allowed, and it is the system working as designed: policy is a local choice. What it means in practice is that relay is probabilistic. A transaction needs a path of willing nodes from the sender to at least one miner. With Core's defaults dominating the network, large payloads relay reliably; a minority of stricter nodes slows nothing down, and a sender who wants certainty can hand the transaction to a miner or a public broadcast endpoint directly.

The archive sees the outcome rather than the debate. Whatever a node's policy, once a block contains an OP_RETURN output, the scanner decodes it. The census on the [protocol index](/protocols) is a record of what miners included, not of what any particular node was willing to relay.

## FAQ

### Did Bitcoin Core 30 remove the OP_RETURN limit?

It raised the default relay limit from 83 bytes to 100,000, which the release notes describe as effectively uncapping it, since transactions hit the maximum transaction size first. It did not touch consensus rules.

### What is the -datacarriersize default now?

100,000 bytes, measured as the aggregate size of all OP_RETURN scriptPubKeys in a transaction.

### Is this a consensus change?

No. Relay and mining policy only. Nodes that never upgrade still validate the same blocks.

### Can I revert to the old cap on my node?

Yes, with `-datacarriersize=83`. It affects only what your node relays and mines, not what it accepts in blocks.

### Are multiple OP_RETURN outputs allowed now?

For relay and mining on default Core nodes, yes, as of 30.0. They were always consensus-valid.

### Does uncapping mean free storage on Bitcoin?

No. Every byte pays the prevailing fee rate, competes with payments for block space, and is stored by every archival node forever. The change removed a policy friction, not the cost.

## Sources

- [Bitcoin Core 30.0 release notes](https://bitcoincore.org/en/releases/30.0/), 10 October 2025, "Mempool policy and mining changes" section.
- Bitcoin Core pull request #32406 and the surrounding discussion for the reasoning behind the default.
- Historical relay defaults: Bitcoin Core 0.9.0 and 0.12.0 release notes.
- The Permanent Record [Field Manual](/guide) for practical etching steps, and the [protocol index](/protocols) for what larger payloads look like in practice.
