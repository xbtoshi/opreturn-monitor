/**
 * Types for src/feedview.js, the renderer shared by the Worker and the inline
 * client script. The view object mirrors the client's state.
 */
export interface FeedMessage {
  id: number;
  txid: string;
  address: string;
  content: string | null;
  category?: string | null;
  protocol?: string | null;
  ops?: Array<{ vout: number; protocol: string; op: string | null; tick: string | null; amount: string | null }> | null;
  likes?: number;
  dup_count?: number;
  is_mempool?: number | boolean;
  created_at?: string;
  block_time?: number | null;
  block_height?: number | null;
  fee_rate?: number | null;
  fee_sats?: number | null;
  collection_id?: number | null;
  sender?: string | null;
  recipient?: string | null;
  monitored_address?: string | null;
}

export interface FeedView {
  pathname: string;
  search: string;
  sort: 'hot' | 'new';
  kind: 'text' | 'all';
  q?: string;
  filter?: number | null;
  address?: string | null;
  category?: string | null;
  protocol?: string | null;
  tick?: string | null;
  block?: number | null;
  blockRow?: { height: number; time: number; tx_count: number; opreturn_count: number; runes_count: number; binary_count: number; stored_count: number } | null;
  feed: FeedMessage[];
  /** The cursor this page was requested with (?before=), or null for the first page. */
  before?: string | null;
  nextBefore?: string | null;
  feedError?: string | null;
  newBlock?: { height: number; rows: FeedMessage[] } | null;
  collections?: Array<{ id: number; name: string; slug?: string | null; description?: string | null; message_count?: number }>;
  categories?: Array<{ category: string; count: number }>;
  protocols?: Array<{ protocol: string; count: number }>;
  ticks?: Array<{ tick: string; protocol: string; count: number }>;
  chain?: { blocks: number; opreturn_outputs: number; runes_outputs: number; highest_height?: number | null; stored_txs?: number; recent?: Array<{ height: number; time: number; stored_count: number }> } | null;
  voted?: Record<string, string>;
  liked?: Record<string, boolean>;
  /**
   * Server-trusted HTML appended after the list (collection address cards).
   * Never put message-derived or user-supplied content here: it is inserted
   * unescaped by both the Worker and the client (which re-emits the block it
   * captured from the server DOM).
   */
  extraHtml?: string;
  /** Fixed "now" for deterministic relative times (tests). */
  now?: number;
  /** Message page: the message (with decoded ops) and up to five related rows. */
  detail?: FeedMessage & { ops?: Array<{ vout: number; protocol: string; op: string | null; tick: string | null; amount: string | null; payload_hex?: string | null }> | null };
  related?: FeedMessage[];
  /** Message page: the fee in USD at the block's price, e.g. "≈ $1.30", resolved before rendering on both sides. */
  feeUsd?: string;
  /** Chat rooms: oldest-to-newest bubbles, the monitored participants and the cursor for earlier pages. */
  chat?: { messages: FeedMessage[]; participants: Array<{ address: string; label: string | null }>; nextBefore: string | null } | null;
}

export interface FeedParams {
  sort: 'hot' | 'new';
  limit: number;
  kind: 'text' | 'all';
  collection_id: number | null;
  address: string | null;
  category: string | null;
  protocol: string | null;
  tick: string | null;
  block: number | null;
  before: string | null;
}

declare const FV: {
  CONTACT: { handle: string; url: string; repo: string; who: string; how: string };
  contactHTML(): string;
  HOSTILE: Record<string, number>;
  PROTO_LABEL: Record<string, string>;
  PROTO_BLURB: Record<string, string>;
  esc(s: unknown): string;
  attr(s: unknown): string;
  fmt(n: number | null | undefined): string;
  shortAddr(a: string | null | undefined): string;
  catCode(n: number): string;
  timeAgo(ts: number | string | null | undefined, now?: number): string;
  msgTime(m: FeedMessage): number | string | undefined;
  tsOf(m: FeedMessage): number;
  feeText(m: FeedMessage): string;
  whenText(m: FeedMessage, now?: number): string;
  shortCol(c: { name: string } | null | undefined): string;
  colSlug(c: { id: number; slug?: string | null } | null | undefined): string;
  catSlug(c: string | null | undefined): string;
  catDot(c: string | null | undefined): string;
  protoLabel(p: string | null | undefined): string;
  protoBlurb(p: string): string;
  isTokenProto(p: string | null | undefined): boolean;
  isProto(m: FeedMessage | null | undefined): boolean;
  fmtAmt(a: unknown): string;
  primaryOp(m: FeedMessage): { protocol: string; op: string | null; tick: string | null; amount: string | null } | null;
  splitMedia(content: string | null | undefined): { text: string; images: string[]; files: string[] };
  mediaHTML(media: { images: string[]; files: string[] }): string;
  parseCryptoEnvelope(content: string | null | undefined): { type: string; leadText: string; isSigned: boolean; bie1Payload: string | null; pgpArmor: string | null } | null;
  displayText(m: FeedMessage): string;
  opLine(m: FeedMessage): string;
  envBadges(m: FeedMessage): string;
  colById(s: FeedView, cid: number | null | undefined): FeedView['collections'] extends Array<infer C> | undefined ? C | null : never;
  colName(s: FeedView, cid: number | null | undefined): string;
  catName(s: FeedView, slug: string): string | null;
  voteGroup(s: FeedView, m: FeedMessage, big?: boolean): string;
  routeName(pathname: string): string;
  defaultSort(routeName: string): 'hot' | 'new';
  validCursor(raw: unknown): string | null;
  nextHref(s: FeedView): string | null;
  feedParams(s: FeedView): FeedParams;
  feedQuery(s: FeedView, limit?: number, before?: string | null): string;
  sortHref(s: FeedView, sort: 'hot' | 'new'): string;
  kindHref(s: FeedView, kind: 'text' | 'all'): string;
  withKind(s: FeedView, path: string): string;
  feedFilters(s: FeedView): Array<{ label: string; href: string }>;
  visibleFeed(s: FeedView): FeedMessage[];
  feedTitle(s: FeedView): string;
  feedKicker(s: FeedView): string;
  filtersHTML(s: FeedView, sheet: boolean): string;
  mobileCtlHTML(s: FeedView): string;
  rowHTML(s: FeedView, m: FeedMessage): string;
  railHTML(s: FeedView): string;
  feedHTML(s: FeedView): string;
  clock(ts: number): string;
  dateOf(ts: number): string;
  fmtSats(n: number): string;
  factRow(k: string, v: string, copyable?: boolean): string;
  detailHTML(s: FeedView & { detail: NonNullable<FeedView['detail']> }): string;
  avatarColor(a: string): string;
  partyOf(s: FeedView, addr: string): { address: string; label: string | null } | null;
  partyName(p: { label: string | null } | null, addr: string): string;
  shortLabel(l: string | null | undefined): string;
  bubbleHTML(s: FeedView, m: FeedMessage, first: boolean, multi: boolean): string;
  chatHTML(s: FeedView): string;
};
export default FV;
