import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  decodeScript,
  decodeTx,
  detectFromText,
  isClassifiable,
  isStorableProtocol,
  parseOpReturnScript,
  reparseContent,
} from '../src/protocols';

function push(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  const n = bytes.length;
  if (n <= 0x4b) return n.toString(16).padStart(2, '0') + hex;
  if (n <= 0xff) return '4c' + n.toString(16).padStart(2, '0') + hex;
  return '4d' + (n & 0xff).toString(16).padStart(2, '0') + (n >> 8).toString(16).padStart(2, '0') + hex;
}

const opReturn = (...pushes: Array<string | Uint8Array>) => '6a' + pushes.map(push).join('');

const LEAF_ICO = '{"p":"ico-20","op":"transfer","tick":"LEAF","amt":"1630000"}';
const LEAF_CRC = '{"p":"crc-20","op":"mint","tick":"LEAF"}';

describe('parseOpReturnScript', () => {
  it('rejects non-OP_RETURN scripts', () => {
    expect(parseOpReturnScript(new Uint8Array([0x76, 0xa9]))).toBeNull();
  });
  it('flags OP_13 runestones and collects pushes', () => {
    const p = parseOpReturnScript(Uint8Array.from(Buffer.from('6a5d0b00c0a23303a8ef8ca30402', 'hex')));
    expect(p?.runes).toBe(true);
    expect(p?.pushes.length).toBe(1);
    expect(p?.pushes[0].length).toBe(11);
  });
  it('handles PUSHDATA1 and PUSHDATA2', () => {
    const big = 'x'.repeat(300);
    const p = parseOpReturnScript(Uint8Array.from(Buffer.from(opReturn(big), 'hex')));
    expect(p?.pushes[0].length).toBe(300);
    const mid = 'y'.repeat(100);
    const q = parseOpReturnScript(Uint8Array.from(Buffer.from(opReturn(mid), 'hex')));
    expect(q?.pushes[0].length).toBe(100);
  });
});

describe('decodeScript', () => {
  it('classifies real outputs from block 968915', () => {
    const txs = JSON.parse(readFileSync(new URL('./fixtures/block-968915-txs-0.json', import.meta.url), 'utf8'));
    const got: Record<string, string> = {};
    for (const tx of txs) {
      tx.vout.forEach((o: { scriptpubkey_type: string; scriptpubkey: string }, i: number) => {
        if (o.scriptpubkey_type !== 'op_return') return;
        const d = decodeScript(o.scriptpubkey, i);
        got[`${tx.txid.slice(0, 8)}:${i}`] = d?.protocol ?? 'null';
      });
    }
    expect(Object.values(got).sort()).toEqual(
      ['core-dao', 'exsat', 'rootstock', 'runes', 'syscoin', 'witness-commitment'].sort()
    );
  });

  it('decodes ico-20 / crc-20 JSON token ops', () => {
    const d = decodeScript(opReturn(LEAF_ICO));
    expect(d).toMatchObject({ protocol: 'ico-20', op: 'transfer', tick: 'LEAF', amount: '1630000', text: LEAF_ICO });
    const m = decodeScript(opReturn(LEAF_CRC));
    expect(m).toMatchObject({ protocol: 'crc-20', op: 'mint', tick: 'LEAF', amount: null });
  });

  it('decodes THORChain, bridge, EVM-hash and LI.FI memos', () => {
    expect(decodeScript(opReturn('OUT:213D7301C9EBF3BDED56219AE362B4A3F153F1DC083B20E8DB21B75AA2EDD1DF'))).toMatchObject({
      protocol: 'thorchain',
      op: 'OUT',
    });
    expect(decodeScript(opReturn('REFUND:D0236DF41A9C7019951D8B2B8928EAC2530361BA08AF67DF362FC467D81C331A'))).toMatchObject({
      protocol: 'thorchain',
      op: 'REFUND',
    });
    expect(decodeScript(opReturn('=:ETH.ETH:0xabc:0/1/0:t:30'))).toMatchObject({ protocol: 'thorchain', op: '=', tick: 'ETH.ETH' });
    expect(decodeScript(opReturn('4sw:to:SOL:Cj5eDaSM4itu77wNmNFpXf93v9udBAnmEByXymh9yGyk'))).toMatchObject({
      protocol: 'bridge-memo',
      op: 'to',
      tick: 'SOL',
    });
    expect(decodeScript(opReturn('to:USDT(TRON):TRFaxBzLqFLsTtLJJXRy9nUKbma9J3bm4K'))).toMatchObject({
      protocol: 'bridge-memo',
      tick: 'USDT(TRON)',
    });
    expect(decodeScript(opReturn('from:112.6USDT(BSC):0x0958780cC4CC5cBB274a3D6BdBaD78d59f5FA79b'))).toMatchObject({
      protocol: 'bridge-memo',
      op: 'from',
      tick: 'USDT(BSC)',
      amount: '112.6',
    });
    expect(decodeScript(opReturn('0x47a9a64ec7a25d572b6d8c598a29fbbcfa0a91d130f17157b062036db961a210'))).toMatchObject({
      protocol: 'evm-hash',
    });
    const lifi = new Uint8Array([...new TextEncoder().encode('=|lifi'), 0xa2, 0x64, 0x12, 0x01]);
    expect(decodeScript(opReturn(lifi))).toMatchObject({ protocol: 'lifi' });
  });

  it('decodes an Omni simple send of USDT', () => {
    // omni | version 0 | type 0 | property 31 | amount 12.5 USDT
    const hex = '6a146f6d6e69' + '0000' + '0000' + '0000001f' + '000000004a817c80';
    expect(decodeScript(hex)).toMatchObject({ protocol: 'omni', op: 'simple-send', tick: 'USDT', amount: '12.5' });
  });

  it('keeps plain human text as text and opaque bytes as binary', () => {
    expect(decodeScript(opReturn('hello satoshi, we are whitehats'))).toMatchObject({ protocol: 'text', text: 'hello satoshi, we are whitehats' });
    expect(decodeScript(opReturn(new Uint8Array([0xd3, 0xc2, 0xbd, 0x40, 0x1c, 0x0f, 0x95, 0xc8, 0xb3, 0xa1, 0x4f, 0xc5])))).toMatchObject({ protocol: 'binary', text: null });
    expect(decodeScript('6a')).toMatchObject({ protocol: 'binary' });
  });

  it('keeps bare protocol markers and control-byte payloads out of the text feed', () => {
    expect(decodeScript(opReturn('SATFLOW'))?.protocol).toBe('satflow');
    expect(decodeScript(opReturn('BRC20PROG'))?.protocol).toBe('brc20-prog');
    expect(decodeScript(opReturn(new Uint8Array([0x44, 0x49, 0x4f, 0x31, 0x02, 0x00, 0x00])))?.protocol).toBe('dio');
    expect(decodeScript(opReturn('hello\u0002world'))?.protocol).toBe('binary');
    expect(decodeScript(opReturn('SATFLOW is great'))?.protocol).toBe('text');
  });

  it('decodes the ak21 mint: nft JSON, a text line and an inline PNG', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAUCAYAAADRA14pAAAACXBIWXMAAAPoAAAD6AG1e1Jr';
    const tx = decodeTx([
      { scriptpubkey: '0014' + '00'.repeat(20), scriptpubkey_type: 'v0_p2wpkh', scriptpubkey_address: 'bc1qrecipient', value: 1000 },
      { scriptpubkey: opReturn('{"p":"nft","op":"mint","name":"ak21"}'), scriptpubkey_type: 'op_return' },
      { scriptpubkey: opReturn('we do what we must because we can'), scriptpubkey_type: 'op_return' },
      { scriptpubkey: opReturn(png), scriptpubkey_type: 'op_return' },
    ]);
    expect(tx.protocol).toBe('nft');
    expect(tx.ops.map((o) => [o.protocol, o.op, o.tick])).toEqual([
      ['nft', 'mint', 'ak21'],
      ['text', null, null],
      ['data-uri', 'image/png', null],
    ]);
    expect(tx.content).toBe(`{"p":"nft","op":"mint","name":"ak21"}\nwe do what we must because we can\n${png}`);
    expect(isStorableProtocol(tx.protocol)).toBe(true);
  });

  it('does not mistake the word "sys" or "CORE" in prose for a protocol tag', () => {
    expect(decodeScript(opReturn('system is down'))?.protocol).toBe('text');
    expect(decodeScript(opReturn('CORE values matter'))?.protocol).toBe('text');
  });
});

describe('decodeTx', () => {
  it('summarises a $LEAF transaction: two ops, ico-20 primary, recipient = first payment output', () => {
    const tx = decodeTx([
      { scriptpubkey: opReturn(LEAF_ICO), scriptpubkey_type: 'op_return' },
      { scriptpubkey: '76a914' + '00'.repeat(20) + '88ac', scriptpubkey_type: 'p2pkh', scriptpubkey_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', value: 546 },
      { scriptpubkey: opReturn(LEAF_CRC), scriptpubkey_type: 'op_return' },
      { scriptpubkey: '5120' + '11'.repeat(32), scriptpubkey_type: 'v1_p2tr', scriptpubkey_address: 'bc1pchange', value: 330 },
    ]);
    expect(tx.protocol).toBe('ico-20');
    expect(tx.ops.map((o) => [o.vout, o.protocol])).toEqual([
      [0, 'ico-20'],
      [2, 'crc-20'],
    ]);
    expect(tx.content).toBe(`${LEAF_ICO}\n${LEAF_CRC}`);
    expect(tx.recipient).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    expect(tx.has_runes).toBe(false);
  });

  it('returns text as primary protocol when the only structured op is binary', () => {
    const tx = decodeTx([
      { scriptpubkey: opReturn('gm'), scriptpubkey_type: 'op_return' },
      { scriptpubkey: opReturn(new Uint8Array([0xff, 0xfe, 0x00, 0x01])), scriptpubkey_type: 'op_return' },
    ]);
    expect(tx.protocol).toBe('text');
    expect(tx.recipient).toBeNull();
  });

  it('flags runes-only transactions as count-only', () => {
    const tx = decodeTx([{ scriptpubkey: '6a5d0b00c0a23303a8ef8ca30402', scriptpubkey_type: 'op_return' }]);
    expect(tx.protocol).toBe('runes');
    expect(tx.has_runes).toBe(true);
    expect(isStorableProtocol(tx.protocol)).toBe(false);
  });
});

describe('reparseContent (legacy rows)', () => {
  it('splits the two-line $LEAF content into two ops', () => {
    const r = reparseContent(`${LEAF_ICO}\n${LEAF_CRC}`);
    expect(r.protocol).toBe('ico-20');
    expect(r.ops.map((o) => o.protocol)).toEqual(['ico-20', 'crc-20']);
  });
  it('keeps a multi-line PGP message as one text op', () => {
    const pgp = '-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\nhello\n-----BEGIN PGP SIGNATURE-----\nabc\n-----END PGP SIGNATURE-----';
    const r = reparseContent(pgp);
    expect(r.protocol).toBe('text');
    expect(r.ops.length).toBe(1);
    expect(r.ops[0].text).toBe(pgp);
  });
  it('recognises single-line memos', () => {
    expect(reparseContent('OUT:1769C9F7CAC358E034ADF844747C9D1D91D65F8A5CB0FB3F21F61D830C72F346').protocol).toBe('thorchain');
    expect(detectFromText('just a message')).toBeNull();
  });
});

describe('residue detectors', () => {
  it('files indexer tags, lottery draws, session ids and pwt ops as protocols, not text', () => {
    expect(detectFromText('pwt1:list5:eyJhbW91bnRNb2RlbCI6ImNhbm9uaWNhbCJ9')).toMatchObject({ protocol: 'pw', op: 'pwt:list5' });
    expect(detectFromText('pwt1:seal5:db3e58…:eyJ')).toMatchObject({ protocol: 'pw', op: 'pwt:seal5' });
    expect(detectFromText('pwdns1:r1:Mg:1J8fGE9yNfaqBjdHNxGwWwUpfKiZfLfGg8:1J8f')).toMatchObject({ protocol: 'pw', op: 'pwdns:r1' });
    expect(detectFromText('pwb1:profile:eyJpbWFnZSI6')).toMatchObject({ protocol: 'pw', op: 'pwb:profile' });
    expect(reparseContent('pwm1:m:incb\npwt1:send3:d4e5eb:1800').protocol).toBe('pw');
    expect(detectFromText('DIO funding')).toMatchObject({ protocol: 'dio', op: 'funding' });
    expect(detectFromText('CNTRPRTY')).toMatchObject({ protocol: 'counterparty' });
    expect(detectFromText('VLGR|2026-09-27|w176|f0|j7|o0|x331|48bfcbbc8cbcdeed')).toMatchObject({ protocol: 'vlgr' });
    expect(detectFromText('atlnotice:ae777f3568d3e31627dc984ffa07fda90fbb1969b5008444944e7538590a6835')).toMatchObject({ protocol: 'atlnotice' });
    expect(detectFromText('BERNSTEIN 2.1 REG f93427ee-1b83-41ba-b69d-946ca5bf2706')).toMatchObject({ protocol: 'bernstein', op: 'reg' });
    expect(detectFromText('ANCHOR-W05 f868075b79545f240ed1efd7801e13f358a54108cbd7dde6cbbc6d1fd83d38d9')).toMatchObject({ protocol: 'anchor' });
    expect(detectFromText('CB|6685707424b14c6953f8f5e5384cb2afd34077ea8fb67fc95e476828130099949537304d0b1acfb3a9becd2243f6e2ea6ab4a0e7e7b')).toMatchObject({ protocol: 'cb-hash' });
    expect(detectFromText('StmpHash260920_830626a60e817fff3b5f6a02211410c29946f0bf9df15a4fbadb6f6fe231859a')).toMatchObject({ protocol: 'stamphash' });
    expect(detectFromText('MTLD_395720')).toMatchObject({ protocol: 'mtld', op: null });
    expect(detectFromText('MTLD_BATCH_3_395171_395177')).toMatchObject({ protocol: 'mtld', op: 'batch' });
    expect(detectFromText('SODA #8470 - Drawn Jun 4, 2026')).toMatchObject({ protocol: 'soda', op: 'draw' });
    expect(detectFromText('SENTINEL|SESSION|377a7d24aae1986ef0bda1dea60f2eac10078898|8a6f644f')).toMatchObject({ protocol: 'sentinel', op: 'session' });
    expect(detectFromText('lEdge115311e82b75c0ba22b3f35883d7fe6c5c1c0a8bc7fef628681fca77def8d1ec')).toMatchObject({ protocol: 'ledge' });
    expect(detectFromText('bitfee\nbitfee:v1:7dacbdf58a0a99d067dff0c56a482a0b65d468ca135315a3c0209aef63a9a9a5i0')).toMatchObject({ protocol: 'bitfee' });
    expect(reparseContent('bitfee\nbitfee:v1:7dacbdf58a0a99d067dff0c56a482a0b65d468ca135315a3c0209aef63a9a9a5i0').protocol).toBe('bitfee');
    expect(detectFromText('bitfee')).toMatchObject({ protocol: 'bitfee' });
  });
  it('does not mistake prose that starts with a marker word for the protocol', () => {
    for (const t of ['bitfee is a scam', 'SODA #1 - Drawn by me yesterday', 'MTLD_ is what they call it', 'pwt1: what is this', 'DIO funding is a scam', 'CB| is not a hash']) {
      expect(detectFromText(t), t).toBeNull();
      expect(reparseContent(t).protocol, t).toBe('text');
    }
  });
  it('files known bare tags as tag rows but leaves the same word inside prose alone', () => {
    expect(detectFromText('LIHG1')).toMatchObject({ protocol: 'tag', op: 'LIHG1' });
    expect(detectFromText('lihg1')).toMatchObject({ protocol: 'tag', op: 'lihg1' });
    expect(detectFromText('BURN')).toMatchObject({ protocol: 'tag' });
    expect(detectFromText('burn')).toMatchObject({ protocol: 'tag', op: 'burn' });
    expect(detectFromText('burn it all down')).toBeNull();
    expect(detectFromText('Dump the bags')).toBeNull();
    expect(reparseContent('GGJD').protocol).toBe('tag');
  });
  it('recognises 0x hashes with |key=value fields and bare hex digests', () => {
    const h = '0x8cb90e6fdf021816d59d0dc36d6f786e4dee679685d2a2624b051ef34b78470d';
    expect(detectFromText(`${h}|depositor=bc1qc0u3r24f8`)).toMatchObject({ protocol: 'evm-hash', op: 'deposit' });
    expect(detectFromText(`${h}|k=v|x=1`)).toMatchObject({ protocol: 'evm-hash', op: 'fields' });
    expect(detectFromText(`${h}|depositor=bc1qmcxg88mrjrstttgxd7ej5dh4juul78rg6d0apf|`)).toMatchObject({ protocol: 'evm-hash', op: 'deposit' });
    expect(detectFromText('0x0EACE3577f013699322972Eda811AC781BC0DB84')).toMatchObject({ protocol: 'evm-hash', op: 'address' });
    expect(detectFromText('110f905;')).toMatchObject({ protocol: 'hash' });
    expect(detectFromText('830626a60e817fff3b5f6a02211410c2')).toMatchObject({ protocol: 'hash' });
    for (const word of ['decade', 'facade', 'beaded', 'Deadbeef', 'face2face', 'deadc0de', 'b00bcafe', 'cafe1234', 'deadbeef1', 'a1b2c3d4', '10e8ecc']) {
      expect(detectFromText(word), word).toBeNull();
    }
    for (const n of ['1234567890', '20260930', '1000000']) expect(detectFromText(n), n).toMatchObject({ protocol: 'binary' });
    expect(detectFromText('be2e5527aa5103056603f1d5a2abc73deda5785a3bc338d2fc203900a458df5f')).toMatchObject({ protocol: 'hash' });
    expect(detectFromText('52494646fa0500005745425056503820ee0500001024009d012a800080003eed6aad')).toMatchObject({ protocol: 'hash' });
  });
  it('counts digits-only and single-character payloads as binary, never as a message', () => {
    for (const t of ['227423', 'x', '!!!', '42 / 7', '']) {
      const d = detectFromText(t);
      if (t === '') expect(d).toBeNull();
      else expect(d, t).toMatchObject({ protocol: 'binary' });
    }
    expect(reparseContent('227423').protocol).toBe('binary');
    expect(isStorableProtocol('binary')).toBe(false);
  });
  it('still keeps prose, emoji and short words as text', () => {
    for (const t of ['hello federal agents :3', '🚀🚀🚀', 'gm', 'kl', 'Not abandoned? Prove it by Sept 30', 'toss a coin to your witcher', 'ГРУ к СВР. Использованы для хакинга!']) {
      expect(detectFromText(t), t).toBeNull();
      expect(reparseContent(t).protocol, t).toBe('text');
    }
  });
});

describe('classification gating', () => {
  it('only text (or not-yet-parsed) rows are classifiable', () => {
    expect(isClassifiable('text')).toBe(true);
    expect(isClassifiable(null)).toBe(true);
    expect(isClassifiable('ico-20')).toBe(false);
  });
});
