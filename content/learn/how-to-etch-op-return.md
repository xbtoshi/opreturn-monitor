---
title: How to Etch an OP_RETURN Message on Bitcoin (Bitcoin Core, Electrum, Sparrow)
description: Step-by-step companion to the Field Manual. Build an OP_RETURN output safely with Bitcoin Core or Electrum, pay the right fee, understand permanence, and find your message in the archive.
kicker: HOW-TO
date: 2026-09-29
updated: 2026-09-29
related: what-is-op-return, bitcoin-core-30-op-return-datacarriersize, genesis-address-tributes
minWords: 1500
---
To etch data into Bitcoin, create a transaction that includes an **OP_RETURN** output, normally with **0 sats** of value, carrying your payload; then sign it and broadcast it, paying a normal miner fee by virtual size. Bitcoin Core's `createrawtransaction` accepts a `data` output directly, and Electrum's Send tab and console accept a script such as `OP_RETURN <hex>` in place of an address. Sparrow Wallet has no native OP_RETURN field yet (the request is an open issue with a pending pull request), though it can sign a PSBT built elsewhere. Once confirmed, the data is permanent and publicly readable.

## Read this first

There is no undo. Anything you write is public forever, tied to the transaction that carried it and therefore to the address that funded it. It costs a real fee, and the fee is not refunded if you change your mind a block later.

Never include private keys, seed phrases, passwords or anything that identifies another person without their consent, and think twice before including anything that identifies you. Do not include anything illegal to publish where you live. Assume the text will be indexed, quoted and screenshotted. This site will index it within a few minutes of it appearing in a block.

This guide never asks for your keys and cannot broadcast anything for you. Every step happens in software you control.

## The mental model

A transaction spends one or more of your coins (inputs) and creates outputs. To etch a message you create one extra output that is an OP_RETURN script with your data and a value of zero, plus a change output that returns the rest of your coins to yourself. The only money leaving your wallet is the miner fee.

If you want the message to land on a specific address's page, on this site or on a block explorer, add a small payment to that address as a third output. The dust minimum, 546 sats for a legacy address or 330 for taproot, is enough. That is how every bulletin-board message in the archive was sent.

## Method A: Bitcoin Core CLI

This is the reference path and the one documented in the [Field Manual](/guide). It works with a full node and your own wallet.

### Hex-encode the payload

```
DATA=$(printf 'gm, permanent record' | xxd -p -c 999)
echo $DATA
```

`xxd -p` prints the bytes as hex; `-c 999` keeps them on one line. UTF-8 text encodes byte for byte, so a 20-character ASCII message is 40 hex characters.

### Build, sign, broadcast

```
bitcoin-cli -named createrawtransaction \
  inputs='[{"txid":"<your-utxo>","vout":0}]' \
  outputs='[{"data":"'$DATA'"},{"<change-addr>":0.0009}]'
```

The `data` key tells Core to build the OP_RETURN output for you. Set the change amount so that input minus outputs leaves the fee you intend. Then:

```
bitcoin-cli signrawtransactionwithwallet <hex>
bitcoin-cli sendrawtransaction <signed-hex>
```

`sendrawtransaction` returns the txid. If your node runs Bitcoin Core 30 or later with default settings, payloads well over 80 bytes and multiple `data` outputs are accepted; see [the policy notes](/learn/bitcoin-core-30-op-return-datacarriersize). If you run an older version or a stricter policy, keep the payload at or under 80 bytes or the node will refuse to relay it with a "scriptpubkey" or "datacarrier" error.

For a cleaner flow with automatic coin selection and change, `walletcreatefundedpsbt` also accepts a `data` output, then `walletprocesspsbt` and `finalizepsbt` produce the hex to send.

## Method B: Electrum

Electrum has supported script outputs for years. In the Send tab, instead of an address, type `OP_RETURN <hex>` with the hex of your payload, set the amount to zero, and add a second line with your destination or change address if you want one. Electrum shows the script in the transaction preview before you sign.

From the console, the same works in `payto` and `paytomany`, which accept scripts alongside addresses. Hardware-wallet users should check their device first: some signers reject or mis-display OP_RETURN outputs, which has been reported for certain Trezor models.

## Method C: Sparrow Wallet

Sparrow is often recommended for this, so it is worth being precise. As of this writing Sparrow does **not** have a field for adding an OP_RETURN output. The feature request, [issue #97](https://github.com/sparrowwallet/sparrow/issues/97), has been open since 2020 and a pull request that adds an optional OP_RETURN field to the Send screen is pending. Until that ships, the workable path is to build the transaction elsewhere, for example with Bitcoin Core as above or with a small script using a library such as embit, export it as a PSBT, and use Sparrow's transaction editor to inspect and sign it. Sparrow's editor shows every output, including the OP_RETURN script, so you can verify what you are signing.

We will update this page and the Field Manual when the field lands.

## Choosing a fee

Fees are paid per virtual byte. A minimal one-input, two-output transaction is roughly 140 vB with a taproot input; each byte of payload adds about one vB. Check a fee estimator for the current rate and multiply. At 5 sat/vB, a 40-byte note costs on the order of 900 sats in total. There is no reason to overpay unless you want it in the next block; the archive does not care how long it took to confirm, though it does show the fee rate on every message. If you underpay and the transaction stalls, most wallets can bump the fee with replace-by-fee, which creates a new transaction with the same OP_RETURN output and a higher fee; the archive drops the replaced version when it disappears from the mempool and keeps the one that confirms.

## After you broadcast

### Confirmation

Your transaction appears in mempools within seconds and in a block whenever a miner includes it. Once it has one confirmation the message is effectively permanent; after six it is as final as anything on Bitcoin.

### Finding yourself in the archive

The Permanent Record scans every block as it arrives, so a human-readable message shows up in the [feed](/feed) shortly after confirmation. Its permanent page is `https://opreturn.xyz/m/<txid>`; you can open it as soon as the transaction has been scanned. If you paid dust to one of the monitored addresses, the message also appears on that collection's page and chat room within the poller's three-minute cycle, usually while it is still unconfirmed.

Protocol-looking payloads, for example anything that parses as JSON with a `p` field, are decoded by the protocol registry rather than shown as a message. If you are writing to people, write prose.

## A complete example with the wallet doing the work

If you would rather not pick inputs by hand, let Bitcoin Core fund the transaction and compute change. This builds a PSBT with your data output, signs it with the node's wallet, and returns hex ready to broadcast:

```
DATA=$(printf 'gm, permanent record' | xxd -p -c 999)
bitcoin-cli -named walletcreatefundedpsbt \
  inputs='[]' \
  outputs='[{"data":"'$DATA'"}]' \
  options='{"fee_rate":5}'
bitcoin-cli walletprocesspsbt <psbt>
bitcoin-cli finalizepsbt <processed-psbt>
bitcoin-cli sendrawtransaction <hex>
```

`fee_rate` is in sat/vB. Add a second output such as `{"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa":0.00000546}` inside the `outputs` array if you want the message to appear on a specific address's page. If you use a hardware wallet, export the PSBT from `walletcreatefundedpsbt`, sign it on the device or in Sparrow's editor, and finalise it with the last two commands.

## Sending to a monitored address

Messages that pay dust to one of the archive's monitored addresses show up in that collection's chat room within the poller's three-minute cycle, before the transaction confirms, and stay there once it does. The [collections page](/collections) lists the addresses and what they are known for. Writing to them is exactly as public as writing anywhere else on the chain, so the same cautions apply: assume the thief, the exchange, the journalists and everyone else are reading, because they are.

## FAQ

### Why is the OP_RETURN output's value zero?

Because nothing can ever spend it. Any sats attached to an OP_RETURN output are burned. Wallets and nodes set it to zero so no value is destroyed by accident.

### Why did my transaction fail to relay?

Most often the payload exceeded the relay limit of the node you submitted to, or the fee rate was below its minimum. Nodes older than Bitcoin Core 30 relay at most 80 bytes of OP_RETURN data and only one such output per transaction.

### How many bytes can I include after Core 30?

Default nodes now relay up to 100,000 bytes across all OP_RETURN outputs in a transaction, which is more than any practical message needs. Fees scale with size, and some nodes keep the old 83-byte limit, so shorter is still more reliable.

### Does the message have to go to a specific address?

No. An OP_RETURN output on its own is enough for the data to be recorded. Paying dust to an address only matters if you want the message to appear on that address's history.

### Will it show up on opreturn.xyz?

Yes, if it decodes as readable text. The explorer scans every block, so a confirmed message appears in the global feed automatically and gets a permanent page at /m/ followed by its txid.

## Sources

- The Permanent Record [Field Manual](/guide), including the live encoder for byte counts and hex.
- Bitcoin Core RPC documentation for `createrawtransaction` and `walletcreatefundedpsbt` (`data` outputs).
- Electrum documentation and the `payto` / `paytomany` console commands, which accept scripts.
- Sparrow Wallet [issue #97](https://github.com/sparrowwallet/sparrow/issues/97), "New field to add OP_RETURN output", open with a pending pull request at the time of writing.
- [Bitcoin Core 30.0 release notes](https://bitcoincore.org/en/releases/30.0/) for relay limits.
