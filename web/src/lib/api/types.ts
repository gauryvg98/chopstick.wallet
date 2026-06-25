/* Shared API contract — mirrored by the Go backend DTOs. */

export type Timeframe = "1s" | "5s" | "30s" | "1m" | "10m" | "1h" | "4h";

export const TIMEFRAMES: Timeframe[] = [
  "1s",
  "5s",
  "30s",
  "1m",
  "10m",
  "1h",
  "4h",
];

export interface Token {
  address: string;
  symbol: string;
  name: string;
  logoURI: string | null;
  priceUsd: number;
  /** 24h price change, percent. */
  change24h: number;
  /** 1h price change, percent. */
  change1h: number;
  marketCap: number;
  liquidity: number;
  volume24h: number;
}

export interface TrendingToken extends Token {
  rank: number;
  /** Small price series for an inline sparkline. */
  sparkline: number[];
}

export interface TokenDetail extends Token {
  fdv: number;
  totalSupply: number;
  holderCount: number;
  /** Combined % of supply held by the top 10 holders. */
  top10Pct: number;
  description: string | null;
  website: string | null;
  twitter: string | null;
  bondingCurve: boolean;
}

export interface OHLCV {
  /** Unix seconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Holder {
  rank: number;
  address: string;
  /** % of total supply. */
  pct: number;
  valueUsd: number;
  tokenAmount: number;
}

export type TradeSide = "buy" | "sell";

export interface Trade {
  id: string;
  side: TradeSide;
  trader: string;
  /** Optional human label (KOL name / ENS-style). */
  traderLabel: string | null;
  amountUsd: number;
  tokenAmount: number;
  priceUsd: number;
  /** Unix milliseconds. */
  timestamp: number;
  txHash: string | null;
}

export interface QuoteRequest {
  inputMint: string;
  outputMint: string;
  /** Raw integer amount of the input token (in base units). */
  amount: number;
  slippageBps?: number;
}

export interface Quote {
  inputMint: string;
  outputMint: string;
  inAmount: number;
  outAmount: number;
  priceImpactPct: number;
  routeLabel: string;
}

export interface Position {
  token: Token;
  tokenAmount: number;
  valueUsd: number;
  costUsd: number;
  pnlUsd: number;
  pnlPct: number;
}

export interface DiscoveryToken {
  address: string;
  symbol: string;
  name: string;
  logoURI: string | null;
  marketCap: number;
  creator: string;
  pool: string;
  createdAt: number; // unix ms
  status: "new" | "graduating";
}

export interface DiscoverFeeds {
  new: DiscoveryToken[];
  graduating: DiscoveryToken[];
  trending: TrendingToken[];
  big: TrendingToken[];
}

export interface TokenBalance {
  mint: string;
  amount: number;
  /** Raw integer amount in base units (string, precision-safe) for sells. */
  rawAmount?: string;
  decimals?: number;
}

export interface WalletHoldings {
  solBalance: number;
  tokens: TokenBalance[];
}

export interface Position {
  mint: string;
  /** Average SOL cost per token still held. */
  avgEntrySol: number;
  /** Realized PnL in SOL (from closed sells). */
  realizedSol: number;
  /** SOL cost basis of the tokens that were sold (for realized %). */
  realizedCostSol: number;
  boughtQty: number;
  soldQty: number;
}

export interface WalletPositions {
  positions: Position[];
  realizedSol: number;
}

export interface ActivityItem {
  signature: string;
  timestamp: number; // unix seconds
  kind: "buy" | "sell" | "deposit" | "withdraw" | "receive" | "send";
  mint?: string;
  tokenAmount?: number;
  solAmount: number;
  feeSol: number;
  failed?: boolean;
}

export interface WalletActivity {
  deposited: number;
  withdrawn: number;
  feesSol: number;
  items: ActivityItem[];
}

export interface ApiClient {
  getBanner(): Promise<Token[]>;
  getTrending(): Promise<TrendingToken[]>;
  getDiscover(): Promise<DiscoverFeeds>;
  getToken(address: string): Promise<TokenDetail>;
  getOHLCV(address: string, tf: Timeframe): Promise<OHLCV[]>;
  getHolders(address: string): Promise<Holder[]>;
  getTrades(address: string): Promise<Trade[]>;
  getQuote(req: QuoteRequest): Promise<Quote>;
  getHoldings(owner: string, fresh?: boolean): Promise<WalletHoldings>;
  getPositions(owner: string, fresh?: boolean): Promise<WalletPositions>;
  getActivity(owner: string, fresh?: boolean): Promise<WalletActivity>;
}
