---
title: Mt. Gox 1Feex and Dormant-Wallet OP_RETURN Notices Explained
description: Early high-balance addresses, including the famous Mt. Gox 1Feex wallet, have been targeted with OP_RETURN legal notices and phishing. What the archive shows and how to stay safe.
kicker: CONSUMER PROTECTION
date: 2026-09-29
updated: 2026-09-29
related: what-is-op-return, reading-hack-negotiation-boards, genesis-address-tributes
minWords: 1400
---
High-balance early Bitcoin addresses, including the widely discussed Mt. Gox-associated **1Feex…** wallet, have received **OP_RETURN** "notices", ownership claims and phishing lures. Those messages are public data embedded in transactions, not spending authorisations; they **do not move BTC** and cannot change who controls a key. The Permanent Record groups this activity under the **High-Value Dormant Wallet Notices** collection ({{addresses:high-value-dormant-wallet-notices}} monitored addresses, {{count:high-value-dormant-wallet-notices}} archived messages). Treat any URL embedded in such a message as hostile until proven otherwise.

## What 1Feex is, at a high level

`1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF` is one of the best-known addresses in Bitcoin's history. In March 2011 it received just under 80,000 BTC in a single transaction, at a time when that was worth a few tens of thousands of dollars. The coins have never moved. The address has been linked in public reporting to the Mt. Gox exchange collapse, and speculation about who holds the key, or whether anyone does, has followed it for more than a decade.

Because it is famous, dormant and enormous, it is a magnet. Anyone who wants attention from whoever might control it, or from the people watching it, knows exactly where to write.

## Why dormant addresses attract notices

An address that has not moved in years signals one of three things: the owner is patient, the owner has lost the key, or the owner is dead or imprisoned. All three invite strangers.

**Claimants** post that the coins are abandoned property and that they, or a firm they represent, intend to take custody unless the owner responds. In 2025 a wave of such notices, delivered both by OP_RETURN and by physical mail to addresses linked to known individuals, drew press coverage; the firm involved described it as a lawful attempt to locate owners of dormant assets, while critics read it as an attempt to manufacture a legal claim.

**Phishers** post that the wallet has been flagged, frozen or scheduled for forfeiture and that the owner must "verify" at a link. The link leads to a page that asks for a seed phrase. This is the same scam as a fake bank email, adapted to the one channel guaranteed to reach a Bitcoin holder.

**Everyone else** posts because the address is a landmark: memorials, jokes, marketing, and proposals to split the fortune.

## What OP_RETURN can and cannot do

This is not legal advice, and jurisdictions differ on abandoned property. But the technical facts are simple and do not depend on law.

An OP_RETURN message is bytes in a transaction that pays a trivial amount to an address. It cannot spend from that address, cannot change its script, and cannot obligate its owner to anything. Bitcoin has no concept of a notice being served; the network cannot tell whether anyone read the message.

Whether a message could ever matter in a court is a separate question, and one the people sending them are betting on. From the chain's point of view the coins are controlled by whoever holds the private key, and by nobody else, no matter what has been written to the address.

## Phishing patterns to recognise

The archive lets you study the genre safely, because the text is displayed as plain content and links are never made clickable. Some recurring shapes, described without reproducing the URLs:

- **Urgency plus authority.** A deadline, a case number, a regulator's name, and a demand to act within days.
- **A verification link.** Any message that asks the owner to visit a site and "confirm ownership" is asking for a seed phrase. Real ownership is proved by signing a message with the key, offline, and never by typing the key into a page.
- **Official-looking sender names** in the text. The sending address is the only thing the chain vouches for, and it is almost always a fresh throwaway.
- **Repetition.** The same notice sent to dozens of dormant addresses in one batch, often within a single block. The archive collapses exact repeats to the same address and shows a count.
- **A fee that is barely there.** Notices are sent at the minimum relay rate. Whoever sends them is optimising for reach, not for being seen by the recipient's wallet quickly.

## What The Permanent Record tracks

The [High-Value Dormant Wallet Notices](/c/high-value-dormant-wallet-notices) collection monitors early, high-balance addresses that have become targets, 1Feex among them. Its [chat room](/c/high-value-dormant-wallet-notices/chat) shows the notices in the order they arrived, attributed to the addresses that sent them, with the classifier's labels attached. Legal-sounding text tends to land in Threats / Hostility or Other; the ads land where ads land.

Every message links to its own page with the transaction id, so a journalist or a lawyer can cite the exact bytes rather than a screenshot. The counts at the top of this page come from the archive itself.

## Reading the notices as a researcher

The same messages that are a hazard for a wallet owner are a useful dataset for anyone studying the phenomenon, and the archive is built to make that safe. Because the text is rendered as inert content, you can read a phishing lure without visiting anything. Because every message has a page with its transaction id, you can trace a campaign: open a notice, note the sending address, then open that address's page to see every other message it funded. Batches sent in one block show up as a burst of identical bubbles in several rooms at once, which is the signature of a mass mailing rather than a targeted claim.

Two patterns stand out in the archived data. First, notices cluster in time. Weeks pass with nothing, then a single sender writes to a dozen dormant addresses within a few blocks, usually after a news cycle about dormant coins or a large old wallet moving. Second, the wording drifts from legal to urgent as a campaign ages: the first messages cite statutes and deadlines, later ones drop the citations and keep the deadline. Whether that reflects a change of author or of tactics is not something the chain can tell you, but it is visible.

If you publish findings, cite message pages rather than screenshots, quote the text without its links, and avoid naming private individuals the notices claim to be addressed to. The address is public; the person, if there is one, may not want to be.

## How to verify a message

If you hold a dormant address and see a notice, three checks settle most cases.

1. **Who paid for it?** Open the message page and look at the sender. A firm that wants to be taken seriously would sign from an address it has publicly attributed to itself. A throwaway sending to fifty addresses at once is not that.
2. **Is it signed?** A PGP or Bitcoin-message signature that verifies against a published key is the only cryptographic evidence of authorship OP_RETURN can carry. The archive shows a badge when one is present. Notices essentially never have one.
3. **What does it ask you to do?** If the answer involves a website and your keys, it is a scam, regardless of the letterhead.

Ignoring a notice endangers nothing. Your coins are exactly as safe after the message as before it. The only way to lose them is to act on it.

## FAQ

### What are the OP_RETURN notices sent to 1Feex?

Public messages embedded in small transactions to the address, ranging from claims that the coins are abandoned property to phishing lures and memorials. They are data, not legal process, and cannot affect the coins.

### Can an on-chain message seize a dormant wallet?

No. Only the private key can move the coins. A message can assert anything; it changes nothing about control.

### Is the "abandoned property" notice campaign legitimate?

The firm behind the 2025 campaign said it was lawfully trying to locate owners. Whether any such notice has legal effect is contested and jurisdiction-dependent; the technical effect is zero. Verify anything of the kind through channels that do not involve your keys.

### Should I click links in OP_RETURN text?

No. The archive does not make them clickable for that reason. Any page reached from an on-chain notice that asks for a seed phrase or private key is a phishing site.

### Where are these messages archived?

In the High-Value Dormant Wallet Notices collection on this site, with a chat view for chronology and a permanent page per message.

## Sources

- The Permanent Record [High-Value Dormant Wallet Notices](/c/high-value-dormant-wallet-notices) collection; counts on this page are live.
- Press coverage of the 2025 dormant-wallet notice campaign (Protos, CoinDesk, BeInCrypto) for the existence and framing of the campaign; no court outcomes are claimed here.
- Public block-explorer history of `1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF`.
- [What is OP_RETURN, and can messages be deleted?](/learn/what-is-op-return) on this site.
