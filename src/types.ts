export interface Collection {
  id: number;
  name: string;
  description: string | null;
  slug: string | null;
  created_at: string;
}

export interface CollectionWithStats extends Collection {
  address_count: number;
  message_count: number;
}

export interface Address {
  id: number;
  address: string;
  label: string | null;
  collection_id: number;
  created_at: string;
}

/** One decoded OP_RETURN output of a stored transaction. */
export interface MessageOp {
  vout: number;
  protocol: string;
  op: string | null;
  tick: string | null;
  amount: string | null;
  payload_hex: string | null;
}

export interface Message {
  id: number;
  txid: string;
  /**
   * The address this row is filed under: the monitored address for rows the
   * address poller found, else the tx's recipient. Never rewritten.
   */
  address: string;
  content: string | null;
  category: string | null;
  likes: number;
  is_mempool: number;
  created_at: string;
  /** Unix seconds the tx confirmed on-chain; NULL if unconfirmed. */
  block_time: number | null;
  raw_hex: string | null;
  fee_sats: number | null;
  fee_rate: number | null;
  collection_id: number | null;
  /** How many txs on this address carry this exact content. */
  dup_count?: number;
  /** Address behind the tx's first input, i.e. who wrote it. NULL until backfilled. */
  sender?: string | null;
  /** Primary protocol slug (text, ico-20, thorchain, ...). NULL until parsed. */
  protocol?: string | null;
  /** Address of the first non-OP_RETURN output. */
  recipient?: string | null;
  /** Monitored address this row is attributed to, if any. */
  monitored_address?: string | null;
  block_height?: number | null;
  /** Decoded OP_RETURN outputs (detail queries only). */
  ops?: MessageOp[];
}

/** One bubble in the chat view: a feed message plus who wrote it. */
export interface ChatMessage extends Message {
  sender: string | null;
  dup_count: number;
}

export interface ChatParticipant {
  address: string;
  label: string | null;
}

export interface ProtocolStat {
  protocol: string;
  count: number;
}

export interface TickStat {
  protocol: string;
  tick: string;
  count: number;
}

export interface Env {
  DB: D1Database;
  SITE_URL?: string;
  OPENAI_API_BASE?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  MEMPOOL_BASE_URL?: string;
  /** Comma-separated Esplora-style hosts tried when the primary fails. */
  MEMPOOL_FALLBACKS?: string;
  CRON_SECRET?: string;
  ADMIN_KEY?: string;
  AI_MAX_PER_RUN?: string;
  AI_DELAY_MS?: string;
  AI_BATCH_SIZE?: string;
  /** "1" enables forward block ingestion (full-chain OP_RETURN feed). */
  INGEST_FORWARD?: string;
  /** "1" enables backwards historical backfill once the tip is caught up. */
  INGEST_BACKFILL?: string;
  INGEST_MAX_BLOCKS_PER_RUN?: string;
  INGEST_TIME_BUDGET_MS?: string;
  BACKFILL_DAYS?: string;
}

export interface RunSummary {
  scanned_txs: number;
  inserted: number;
  classified: number;
  failed_fetches: number;
  skipped: number;
  /** Legacy rows whose protocol/ops were derived from stored text this run. */
  reparsed: number;
  /** Rows whose sender/fee/recipient were filled from a tx-detail fetch this run. */
  details_filled: number;
  /** Blocks ingested by the full-chain scanner this run (forward + backfill). */
  blocks_ingested: number;
  took_ms: number;
  /** Wall-clock per pipeline phase, for tuning the cron budget. */
  phase_ms: Record<string, number>;
}
