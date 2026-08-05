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

export interface Message {
  id: number;
  txid: string;
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
}

export interface Env {
  DB: D1Database;
  SITE_URL?: string;
  OPENAI_API_BASE?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  MEMPOOL_BASE_URL?: string;
  CRON_SECRET?: string;
  ADMIN_KEY?: string;
  AI_MAX_PER_RUN?: string;
  AI_DELAY_MS?: string;
  AI_BATCH_SIZE?: string;
}

export interface RunSummary {
  scanned_txs: number;
  inserted: number;
  classified: number;
  failed_fetches: number;
  skipped: number;
  took_ms: number;
}
