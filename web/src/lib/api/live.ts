import type {
  ApiClient,
  DiscoverFeeds,
  Holder,
  OHLCV,
  Quote,
  QuoteRequest,
  Timeframe,
  Token,
  TokenDetail,
  Trade,
  TrendingToken,
  WalletHoldings,
  WalletActivity,
  WalletPositions,
} from "./types";

/** Talks to the Go backend over REST. Selected when NEXT_PUBLIC_API_BASE is set. */
export class LiveClient implements ApiClient {
  constructor(private base: string) {
    this.base = base.replace(/\/$/, "");
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
    return (await res.json()) as T;
  }

  getBanner() {
    return this.get<Token[]>("/api/banner");
  }
  getTrending() {
    return this.get<TrendingToken[]>("/api/tokens/trending");
  }
  getDiscover() {
    return this.get<DiscoverFeeds>("/api/discover");
  }
  getToken(address: string) {
    return this.get<TokenDetail>(`/api/tokens/${address}`);
  }
  getOHLCV(address: string, tf: Timeframe, limit?: number) {
    const q = limit && limit > 0 ? `&limit=${limit}` : "";
    return this.get<OHLCV[]>(`/api/tokens/${address}/ohlcv?tf=${tf}${q}`);
  }
  getHolders(address: string) {
    return this.get<Holder[]>(`/api/tokens/${address}/holders`);
  }
  getTrades(address: string) {
    return this.get<Trade[]>(`/api/tokens/${address}/trades`);
  }
  getHoldings(owner: string, fresh = false) {
    return this.get<WalletHoldings>(
      `/api/wallet/${owner}/holdings${fresh ? "?fresh=1" : ""}`
    );
  }
  getPositions(owner: string, fresh = false) {
    return this.get<WalletPositions>(
      `/api/wallet/${owner}/positions${fresh ? "?fresh=1" : ""}`
    );
  }
  getActivity(owner: string, fresh = false) {
    return this.get<WalletActivity>(
      `/api/wallet/${owner}/activity${fresh ? "?fresh=1" : ""}`
    );
  }

  async getQuote(req: QuoteRequest): Promise<Quote> {
    const res = await fetch(`${this.base}/api/swap/quote`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`API /api/swap/quote → ${res.status}`);
    return (await res.json()) as Quote;
  }
}
