import { describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { blockHashOf, parseRawBlock, txidOf } from '../src/blocks';
import { base58check, scriptToAddress, segwitAddress, sha256 } from '../src/address';
import { decodeScript } from '../src/protocols';

const raw = new Uint8Array(gunzipSync(readFileSync(new URL('./fixtures/block-968915.raw.gz', import.meta.url))));
const page = JSON.parse(readFileSync(new URL('./fixtures/block-968915-txs-0.json', import.meta.url), 'utf8')) as Array<{
  txid: string;
  vout: Array<{ scriptpubkey: string; scriptpubkey_address?: string; value: number }>;
}>;

describe('sha256 / address encoding', () => {
  it('matches known SHA-256 vectors', () => {
    const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
    expect(hex(sha256(new Uint8Array(0)))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const long = new Uint8Array(1000).fill(0x61);
    expect(hex(sha256(long))).toBe(require('node:crypto').createHash('sha256').update(long).digest('hex'));
  });
  it('encodes Satoshi\'s genesis address and the BIP-173/350 vectors', () => {
    const genesisHash160 = Buffer.from('62e907b15cbf27d5425399ebf6f0fb50ebb88f18', 'hex');
    expect(base58check(new Uint8Array([0x00, ...genesisHash160]))).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    expect(segwitAddress('bc', 0, Buffer.from('751e76e8199196d454941c45d1b3a323f1433bd6', 'hex'))).toBe(
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
    );
    expect(
      segwitAddress('bc', 1, Buffer.from('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex'))
    ).toBe('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0');
  });
});

describe('parseRawBlock on block 968915', () => {
  const block = parseRawBlock(raw);

  it('reads the header hash and tx count', () => {
    expect(blockHashOf(raw)).toBe('0000000000000000000038ae88fdbad72b434847db749d982a586f97b64e0af1');
    expect(block.txCount).toBe(5090);
  });

  it('finds every OP_RETURN output with the expected protocol census', () => {
    let opReturn = 0;
    let runes = 0;
    for (const tx of block.txs) {
      for (const o of tx.outputs) {
        if (o.script[0] !== 0x6a) continue;
        opReturn++;
        if (decodeScript(o.script)?.protocol === 'runes') runes++;
      }
    }
    expect(opReturn).toBe(3774);
    expect(runes).toBe(3694);
  });

  it('computes txids and addresses that match the API for the first 25 txs', () => {
    const byIndex = new Map(block.txs.map((t) => [t.index, t]));
    const all = parseRawBlock(raw, false);
    for (let i = 0; i < page.length; i++) {
      const tx = all.txs[i];
      expect(txidOf(raw, tx)).toBe(page[i].txid);
      page[i].vout.forEach((o, k) => {
        expect(Buffer.from(tx.outputs[k].script).toString('hex')).toBe(o.scriptpubkey);
        expect(tx.outputs[k].value).toBe(o.value);
        expect(scriptToAddress(tx.outputs[k].script)).toBe(o.scriptpubkey_address ?? null);
      });
      if (page[i].vout.some((o) => o.scriptpubkey.startsWith('6a'))) expect(byIndex.has(i)).toBe(true);
    }
  });
});
