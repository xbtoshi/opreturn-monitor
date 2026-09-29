---
title: How to Read the Bitget and Liquid Network OP_RETURN Negotiation Boards
description: When stolen or disputed BTC sits at known addresses, OP_RETURN becomes a negotiation channel. How The Permanent Record groups the Liquid and Bitget boards, and what an empty board means.
kicker: INCIDENT BOARDS
date: 2026-09-29
updated: 2026-09-29
related: coldcard-exploit-bulletin-board, what-is-op-return, prompt-injection-on-bitcoin
minWords: 1500
---
After a major Bitcoin-related incident, the addresses holding disputed or stolen funds start receiving public **OP_RETURN** messages: offers, threats, legal bluster, phishing and spam, and occasionally a real negotiation. The Permanent Record tracks two such boards from September 2026. The **Liquid Network Peg-Out Bulletin Board** covers {{addresses:liquid-network-peg-out-bulletin-board}} addresses with {{count:liquid-network-peg-out-bulletin-board}} archived messages, including signed and encrypted exchanges between the whitehats and Blockstream's security team. The **Bitget Hack Bulletin Board** watches the {{addresses:bitget-hack-bulletin-board}} largest parcels of the stolen funds and has archived {{count:bitget-hack-bulletin-board}} messages so far. Use the chat views for chronology, and treat authorship as unverified unless independently proven.

## Two incidents, two boards

They happened within weeks of each other and both involve large amounts of BTC at known addresses, so they get conflated. They are unrelated.

### The Liquid Network peg-out board

In September 2026 a group describing themselves as whitehats used an L-BTC inflation bug together with a valid SideSwap peg-out authorisation to withdraw roughly 3,996 BTC from the Liquid federation in block 965,783, about 95 percent of its reserves. The coins went to an intermediary address and were forwarded, in the same block, to a holding address. The first message from that holding address, "we are whitehats. contact us on chain", set the tone: this was a negotiation conducted in public, on Bitcoin, using OP_RETURN.

The collection monitors the holding address, the drained peg-out address, the intermediary, and the address Blockstream's security team used to respond. That last one is unusual. Blockstream signed its messages with the company's published PGP key and encrypted the substantive ones to the whitehats' key using Electrum's BIE1 ECIES scheme, so the chat room shows a verifiable, partly unreadable conversation between two identified parties, surrounded by the usual crowd of lawyers, launderers and wallet advertisements.

### The Bitget hot-wallet breach board

On 24 September 2026 Bitget reported about $387.5 million leaving its hot and warm wallets across several chains. Much of what moved was swapped into BTC, and Bitget published a public tracker of the attacker's addresses. The collection monitors the eight largest unspent parcels on that tracker, about 190 BTC in total, mostly a single receipt each.

At the time of writing those addresses have received {{count:bitget-hack-bulletin-board}} OP_RETURN messages. That is not a bug. Fresh attacker addresses attract messages only once they are widely known and only if the holder seems reachable; a consolidation address that never moves again may stay silent forever. The board exists so that if a conversation starts, it is archived from the first message.

## Why OP_RETURN shows up in negotiations

When you know an address but not a person, OP_RETURN is the only channel you can be certain the holder can see. Any wallet that shows transaction history shows the incoming dust payment, and a block explorer shows the attached text. Nothing else about the counterparty is needed: no email, no handle, no jurisdiction.

The same property makes it attractive to everyone else. Offers to launder are cheap to broadcast and reach the one reader who matters. Law firms post notices because a permanent, timestamped public record has some value later. Victims write because there is nowhere else to write.

For an exchange or a security team, replying through OP_RETURN has a further advantage: a message signed with a known PGP key is verifiable by anyone, and an encrypted reply is unreadable by everyone but the intended recipient, while both remain on a public ledger neither party can later deny.

## How to read a board

1. **Start with the collection page** ([Liquid](/c/liquid-network-peg-out-bulletin-board), [Bitget](/c/bitget-hack-bulletin-board)). It lists the monitored addresses with their roles and the messages sorted by votes.
2. **Switch to the chat room** ([Liquid chat](/c/liquid-network-peg-out-bulletin-board/chat), [Bitget chat](/c/bitget-hack-bulletin-board/chat)) for chronology. Messages from monitored parties sit on the right, everyone else on the left, and each bubble is attributed to the address that funded its transaction. Repeated spam from one sender is collapsed into a single bubble with a count.
3. **Use the categories.** The classifier's labels, threats, ads, appeals, other, let you drop the noise and follow only the exchange between the principals.
4. **Verify through the message page.** Every bubble links to `/m/<txid>`, which shows the raw payload, block height, fee and a link to the transaction on a public block explorer. Quote that page, not a screenshot.
5. **Check signatures where they exist.** Messages carrying a PGP signature show a badge; the key id can be checked against the publisher's published key. The Liquid room includes a key-exchange banner with the fingerprints involved. Encrypted BIE1 payloads can be decrypted in the browser by whoever holds the recipient's private key, which is to say not by you.

## Activity reality check

Boards are not equally lively, and the numbers on this page are read live from the archive rather than typed in.

- Liquid: {{count:liquid-network-peg-out-bulletin-board}} messages across {{addresses:liquid-network-peg-out-bulletin-board}} addresses. Dense, with both sides of a real negotiation visible.
- Bitget: {{count:bitget-hack-bulletin-board}} messages across {{addresses:bitget-hack-bulletin-board}} addresses. A watchlist rather than a thread, for now.

If you are building a story or a timeline, the Liquid board is the worked example and the Bitget board is the thing to keep an eye on. Both collections update automatically as new transactions touch the monitored addresses, so a page that is empty today may be the busiest room on the site next week; the counts above will move with it, and the chat rooms keep every message in the order it arrived.

## Limits of interpretation

Anyone can etch. A message that claims to come from Bitget, from Blockstream, from law enforcement or from the attacker proves only that someone paid a few hundred sats to include it. Authorship is credible in exactly two cases: the funding address is one already known to belong to the party, or the message carries a signature that verifies against a key already known to belong to them. The Blockstream messages on the Liquid board satisfy both; almost nothing else on either board satisfies either.

Read offers, deadlines and "official" notices with that in mind. The archive preserves them because they are part of the record, not because they are true.

## A short timeline of the Liquid board

The chat room tells the story better than a summary can, but the opening moves show how these boards work.

- **6 September 2026, 18:30 UTC.** The holding address writes "we are whitehats. contact us on chain" to the drained peg-out address. It is the first message on the board and the first public statement from whoever holds the coins.
- **6 September, 19:31 UTC.** A reply from an address later confirmed as Blockstream's: "Please contact security@blockstream.com". Short, unsigned, and enough to establish that the other side was watching the chain.
- **7 September.** Blockstream's next message is PGP-signed with the company's published key, and the board shows a verifiable badge on it. From here the substantive exchange moves to encrypted BIE1 payloads addressed to the whitehats' key, readable only by them, with the signatures still checkable by anyone.
- **The days after.** The crowd arrives: laundry ads, lawyers, wallet advertisements, victims of unrelated incidents, and people who simply want their name in the record. The room's "Messages" filter and the category chips are the way to keep the negotiation visible through the noise.

Everything in that list can be checked on the message pages, which is the point of archiving it this way. The board is not a claim about what happened; it is the primary source.

## FAQ

### Are the Liquid hackers really negotiating on Bitcoin OP_RETURN?

The address holding the withdrawn coins has posted messages inviting contact on chain, and Blockstream's security team has replied with signed and encrypted messages to that address. The full exchange, and everything written around it, is in the collection's chat room.

### Where are the Bitget stolen-BTC OP_RETURN messages?

The Bitget board monitors the eight largest parcels from Bitget's public tracker. As of now it has {{count:bitget-hack-bulletin-board}} archived messages; the page updates automatically if any arrive.

### How do I follow the conversation in order?

Open the collection's chat room. It shows messages oldest to newest with a day divider, and "Load earlier" walks back through history.

### Are the messages from the real attacker?

Only a message sent from an address already attributed to the attacker can be. Text claiming to be from them, sent from an unrelated address, is just text.

### Can I pull the conversation programmatically?

Yes. `GET /api/chat?collection_id=<id>` returns the chronological stream with sender attribution, and the message pages are also available as Markdown for agents. See [the API guide](/learn/op-return-api-for-agents).

## Sources

- The Permanent Record collections for the [Liquid Network peg-out](/c/liquid-network-peg-out-bulletin-board) and [Bitget hack](/c/bitget-hack-bulletin-board) boards; counts on this page are live.
- Bitget's public statement and stolen-funds tracker for the 24 September 2026 incident, and Blockstream's public statements on the Liquid withdrawal, for background only.
- On-chain forensics coverage of the Liquid peg-out by blockchain analytics firms, cited for context; this site does not re-investigate flows.
- Blockstream's published PGP key (blockstream.com/pgp.txt) for signature checks.
