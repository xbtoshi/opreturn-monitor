/**
 * Facts the site states in more than one place. Keeping the wording here
 * stops pages contradicting each other (see test/learn.test.ts).
 */

/** Bitcoin Core 30.0 release notes, 2025-10-10: https://bitcoincore.org/en/releases/30.0/ */
export const CORE30 = {
  version: 'Bitcoin Core 30.0',
  released: '2025-10-10',
  url: 'https://bitcoincore.org/en/releases/30.0/',
  /** One-sentence summary safe to reuse in FAQs. */
  summary:
    'Bitcoin Core 30.0 (October 2025) raised the default -datacarriersize from 83 to 100,000 bytes, which effectively uncaps OP_RETURN data because the transaction size limit is reached first, and began relaying and mining transactions with multiple OP_RETURN outputs. This is relay and mining policy, not a consensus rule; node operators can restore the old limit with -datacarriersize=83.',
  /** Shorter phrasing for the Field Manual. */
  short:
    'Bitcoin Core 30.0 (2025) raised the default data-carrier limit from 83 bytes to 100,000, so larger payloads and multiple OP_RETURN outputs now relay and confirm on nodes running default settings. That is policy, not consensus, and some nodes keep the old 83-byte limit.',
  /** The old wording that must not reappear anywhere on the site. */
  banned: 'removed the default 80-byte relay cap',
};

/** sparrowwallet/sparrow issue #97 ("New field to add OP_RETURN output") is still open, with PR #1927 pending. */
export const SPARROW = {
  issueUrl: 'https://github.com/sparrowwallet/sparrow/issues/97',
  /** Honest wording for wallet guidance. */
  wallets:
    'Bitcoin Core via bitcoin-cli (documented below), or Electrum, whose Send tab and console accept a script such as OP_RETURN <hex> in place of an address. Sparrow Wallet has no native OP_RETURN field yet (the feature request, issue #97, is still open with a pull request pending), but its transaction editor can load and sign a PSBT built elsewhere. Custodial and exchange wallets will not let you.',
  banned: 'Tools → Add OP_RETURN',
};

export const HISTORY_CAPS =
  'Standard relay policy limited OP_RETURN payloads to 40 bytes from Bitcoin Core 0.9 (March 2014) and 80 bytes (83 including the opcode and push) from Bitcoin Core 0.11 (July 2015) onward; those were policy limits, never consensus rules.';
