---
title: Genesis Address Tributes: The On-Chain Archive of Messages to Satoshi
description: People still send tributes, and OP_RETURN messages, to Bitcoin's Genesis address. Explore The Permanent Record's Genesis & Satoshi Tribute collection.
kicker: CULTURE
date: 2026-09-29
updated: 2026-09-29
related: what-is-op-return, how-to-etch-op-return, op-return-vs-ordinals-vs-runes
minWords: 1200
---
Bitcoin's **Genesis address**, `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`, is a long-running cultural magnet for tributes to Satoshi Nakamoto. Alongside the unspendable coins people send it, commemorations, prayers and graffiti arrive as **OP_RETURN** text, and lately so do token protocols that use the address as a burn destination. The Permanent Record maintains a **Genesis & Satoshi Tribute** collection ({{addresses:genesis-satoshi-tribute}} monitored address, {{count:genesis-satoshi-tribute}} archived transactions), public, permanent and readable through its chat and feed views.

## The Genesis address as a cultural attractor

The first block of Bitcoin, mined on 3 January 2009, paid its 50 BTC reward to the Genesis address. Because of a quirk in how that block was written, those 50 BTC can never be spent. Nothing sent to the address since can be spent either, unless Satoshi's key still exists and its holder chooses to use it, which has never happened.

That makes the address something rare in Bitcoin: a place whose meaning is entirely symbolic. Sending coins there is a donation to no one, a tip to a founder who cannot collect it, or a way of taking a satoshi out of circulation forever in someone's name. People have done it on anniversaries, after deaths, at all-time highs and at bottoms. The balance, well over a hundred bitcoin by now, is the sum of those gestures.

## Tributes versus spendability

Two kinds of tribute coexist and get confused. **Value tributes** are ordinary payments to the address: a few thousand sats, occasionally much more, that sit there permanently. Block explorers show them as a growing balance and much of the internet discussion of the address is about that number.

**Message tributes** are OP_RETURN outputs attached to transactions that also pay dust to the address, so that the words appear in its history. These are the ones this archive is about. They cost the same as any other message, a few hundred sats plus the dust, and they say what a payment cannot: thank you, rest in peace, happy birthday, we are still here.

The [collection](/c/genesis-satoshi-tribute) monitors the address for both, but only transactions carrying a readable OP_RETURN, or a protocol payload the registry can decode, become entries.

## OP_RETURN messages in the tribute culture

Read the [chat room](/c/genesis-satoshi-tribute/chat) and a few themes repeat.

**Memorials.** Messages for people who have died, sometimes bitcoiners, often not, addressed to a place the writer trusts to outlast them. These are the most affecting entries and the reason the archive treats the room with some care.

**Anniversaries and milestones.** Every 3 January brings a cluster. So do halvings, price milestones and the odd personal event: a wedding, a birth, a first bitcoin bought.

**Philosophy and scripture.** Quotations, verses, short manifestos about money and time. The classifier files most of these under Haiku / Philosophical.

**Graffiti.** "I was here", handles, jokes, ASCII art. Harmless and endless.

**Protocol burns.** A recent development with an outsized effect on the counts. Token protocols that need a burn address, or want the cachet, use the Genesis address as a destination. The `ico-20` and `crc-20` JSON operations that mint and transfer the $LEAF token, for example, pay 546 sats to the Genesis address with each operation. They are not tributes in any human sense, but they are transactions to the address carrying OP_RETURN data, so the registry decodes them and they appear under [the ico-20 protocol](/p/ico-20) and [the LEAF ticker](/tick/LEAF) rather than in the human feed. This is why the collection's transaction count is far larger than its number of messages a person would want to read.

## Inside the collection

The collection page lists entries by votes or by time, and the sidebar filter lets you keep only the human categories. The chat room shows everything chronologically, attributed to the sending address; nobody has ever replied from the Genesis address itself, so every bubble sits on the left. The "All protocols" switch reveals the token traffic when you want to see how the address is being used by machines.

Each entry has a permanent page at `/m/<txid>` with the decoded text, the block, the fee and a link to the transaction on a public explorer. If you cite a tribute, cite that page.

## Permanence ethics

A memorial etched into Bitcoin is a real memorial: it will outlive the person who wrote it and every website that displays it, including this one. That is the appeal and the responsibility. A few things worth knowing before writing one.

- It cannot be edited or removed, even by you. Typos are permanent.
- It is linked to the address that paid for it. If that address is linked to you, so is the message.
- Anyone can write to the address, so the room also contains spam and token traffic. A memorial there sits among strangers; the archive's filters help, but the chain does not.
- The dust you attach is unspendable. Sending more than dust is a gesture, not a transfer.

The [Field Manual](/guide) explains how to build the transaction. The short version: keep it to plain text, check the encoder's byte count, and read it twice before you broadcast.

## Reading the room in practice

The chat room is the fastest way in, but it rewards a little technique. Use the category filter to keep Haiku / Philosophical and Other and drop the ads, which removes most of the noise without hiding anything a person wrote. Sort the collection page by votes to find the entries other readers thought were worth their proof-of-work; the vote itself costs a few milliseconds of hashing, which is enough to keep bots from stuffing the ballot. Use "Load earlier" to walk back through the years; the day dividers make it easy to find an anniversary cluster.

Two things to keep in mind while reading. The sender shown on each bubble is the address that funded the transaction, which is usually a fresh change address and rarely tells you anything about the writer. And the archive shows what decodes as text; a tribute sent as a bare payment with no OP_RETURN is visible on a block explorer as a balance change but has nothing for this site to display.

## FAQ

### Do people leave messages for Satoshi on Bitcoin?

Yes, continuously. Messages arrive as OP_RETURN outputs on transactions that pay dust to the Genesis address, and the collection on this site has archived {{count:genesis-satoshi-tribute}} transactions to it so far.

### What is the Genesis & Satoshi Tribute collection?

The archive's record of everything sent to the Genesis address that carries decodable OP_RETURN data: human tributes, and the token-protocol operations that use the address as a burn destination.

### Can tributes be removed?

No. Once confirmed they are part of Bitcoin's history, which no party can rewrite.

### Why are so many entries token JSON rather than tributes?

Because token protocols such as ico-20 and crc-20 send their operations to the Genesis address with a dust payment. The registry decodes them into protocol and ticker pages; use the "Messages" filter to see only human text.

### Where can I read the tributes?

In the collection's chat room, in chronological order, or on the collection page sorted by votes. Each has a permanent page you can link to.

## Sources

- The Permanent Record [Genesis & Satoshi Tribute](/c/genesis-satoshi-tribute) collection; counts on this page are live.
- The Bitcoin Genesis block (block 0), 3 January 2009, and the unspendability of its coinbase output, as documented in Bitcoin's source and the Bitcoin Wiki.
- The [ico-20 protocol page](/p/ico-20) for the token traffic the address receives.
