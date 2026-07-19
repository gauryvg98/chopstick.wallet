// Package types holds the API DTOs. JSON tags mirror the frontend's
// web/src/lib/api/types.ts exactly so the two stay in lockstep.
package types

type Token struct {
	Address   string  `json:"address"`
	Symbol    string  `json:"symbol"`
	Name      string  `json:"name"`
	LogoURI   *string `json:"logoURI"`
	PriceUsd  float64 `json:"priceUsd"`
	Change24h float64 `json:"change24h"`
	Change1h  float64 `json:"change1h"`
	MarketCap float64 `json:"marketCap"`
	Liquidity float64 `json:"liquidity"`
	Volume24h float64 `json:"volume24h"`
}

type TrendingToken struct {
	Token
	Rank      int       `json:"rank"`
	Sparkline []float64 `json:"sparkline"`
}

type TokenDetail struct {
	Token
	FDV         float64 `json:"fdv"`
	TotalSupply float64 `json:"totalSupply"`
	HolderCount int     `json:"holderCount"`
	Top10Pct    float64 `json:"top10Pct"`
	Description *string `json:"description"`
	Website     *string `json:"website"`
	Twitter     *string `json:"twitter"`
	// BondingCurve is true for a pump.fun token that hasn't graduated to a DEX
	// yet (so it has no DEX chart / trade feed).
	BondingCurve bool `json:"bondingCurve"`
}

type OHLCV struct {
	Time   int64   `json:"time"` // unix seconds
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume float64 `json:"volume"`
}

type Holder struct {
	Rank        int     `json:"rank"`
	Address     string  `json:"address"`
	Pct         float64 `json:"pct"`
	ValueUsd    float64 `json:"valueUsd"`
	TokenAmount float64 `json:"tokenAmount"`
}

type Trade struct {
	ID          string  `json:"id"`
	Side        string  `json:"side"` // "buy" | "sell"
	Trader      string  `json:"trader"`
	TraderLabel *string `json:"traderLabel"`
	AmountUsd   float64 `json:"amountUsd"`
	TokenAmount float64 `json:"tokenAmount"`
	PriceUsd    float64 `json:"priceUsd"`
	Timestamp   int64   `json:"timestamp"` // unix ms
	TxHash      *string `json:"txHash"`
}

type QuoteRequest struct {
	InputMint   string `json:"inputMint"`
	OutputMint  string `json:"outputMint"`
	Amount      int64  `json:"amount"`
	SlippageBps int    `json:"slippageBps"`
}

type Quote struct {
	InputMint      string  `json:"inputMint"`
	OutputMint     string  `json:"outputMint"`
	InAmount       int64   `json:"inAmount"`
	OutAmount      int64   `json:"outAmount"`
	PriceImpactPct float64 `json:"priceImpactPct"`
	RouteLabel     string  `json:"routeLabel"`
}

// DiscoveryToken is a freshly-discovered token (new launch or migration).
type DiscoveryToken struct {
	Address   string  `json:"address"`
	Symbol    string  `json:"symbol"`
	Name      string  `json:"name"`
	LogoURI   *string `json:"logoURI"`
	MarketCap float64 `json:"marketCap"`
	Creator   string  `json:"creator"`
	Pool      string  `json:"pool"`
	CreatedAt int64   `json:"createdAt"` // unix ms when first seen
	Status    string  `json:"status"`    // "new" | "graduating"
}

// DiscoverFeeds is the payload of the /api/discover endpoint.
type DiscoverFeeds struct {
	New        []DiscoveryToken `json:"new"`
	Graduating []DiscoveryToken `json:"graduating"`
	Trending   []TrendingToken  `json:"trending"`
	Big        []TrendingToken  `json:"big"` // established large caps (>$10M)
}

// TokenBalance is one SPL token holding in a wallet. RawAmount + Decimals let the
// client build an exact-integer sell amount without float rounding.
type TokenBalance struct {
	Mint      string  `json:"mint"`
	Amount    float64 `json:"amount"`
	RawAmount string  `json:"rawAmount"`
	Decimals  int     `json:"decimals"`
}

// WalletHoldings is a wallet's on-chain balances (read from RPC, not a DB).
type WalletHoldings struct {
	SolBalance float64        `json:"solBalance"`
	Tokens     []TokenBalance `json:"tokens"`
}

// Position is a per-token cost basis reconstructed from the wallet's on-chain
// swap history — all in SOL, so no historical USD pricing is needed. AvgEntrySol
// is the average SOL cost of the tokens still held; RealizedSol is closed PnL.
type Position struct {
	Mint            string  `json:"mint"`
	AvgEntrySol     float64 `json:"avgEntrySol"`
	RealizedSol     float64 `json:"realizedSol"`
	RealizedCostSol float64 `json:"realizedCostSol"` // SOL cost basis of the tokens sold (for realized %)
	BoughtQty       float64 `json:"boughtQty"`
	SoldQty         float64 `json:"soldQty"`
}

// WalletPositions is the per-token cost basis + total realized PnL for a wallet,
// derived from chain history (no DB).
type WalletPositions struct {
	Positions   []Position `json:"positions"`
	RealizedSol float64    `json:"realizedSol"`
}

// ActivityItem is one recent on-chain action (swap, deposit, transfer).
type ActivityItem struct {
	Signature   string  `json:"signature"`
	Timestamp   int64   `json:"timestamp"` // unix seconds
	Kind        string  `json:"kind"`      // buy | sell | deposit | withdraw | receive | send
	Mint        string  `json:"mint,omitempty"`
	TokenAmount float64 `json:"tokenAmount,omitempty"`
	SolAmount   float64 `json:"solAmount"` // SOL moved (always positive; Kind gives direction)
	FeeSol      float64 `json:"feeSol"`
	Failed      bool    `json:"failed,omitempty"`
}

// WalletActivity is a wallet's recent activity plus lifetime deposit/fee totals,
// reconstructed from chain history (no DB).
type WalletActivity struct {
	Deposited float64        `json:"deposited"` // total SOL deposited into the wallet
	Withdrawn float64        `json:"withdrawn"` // total SOL sent out
	FeesSol   float64        `json:"feesSol"`   // total network/priority fees paid
	Items     []ActivityItem `json:"items"`
}

// Timeframe values accepted by the OHLCV endpoint.
type Timeframe string

const (
	Tf1s  Timeframe = "1s"
	Tf5s  Timeframe = "5s"
	Tf30s Timeframe = "30s"
	Tf1m  Timeframe = "1m"
	Tf10m Timeframe = "10m"
	Tf1h  Timeframe = "1h"
	Tf4h  Timeframe = "4h"
)

// BucketSeconds is the candle interval for a timeframe.
func (t Timeframe) BucketSeconds() int64 {
	switch t {
	case Tf1s:
		return 1
	case Tf5s:
		return 5
	case Tf30s:
		return 30
	case Tf1m:
		return 60
	case Tf10m:
		return 600
	case Tf1h:
		return 3600
	case Tf4h:
		return 14400
	default:
		return 60
	}
}

// SubMinute reports whether the timeframe is finer than GeckoTerminal's 1m
// OHLCV floor (so it must be built from trades).
func (t Timeframe) SubMinute() bool {
	return t == Tf1s || t == Tf5s || t == Tf30s
}

// PriceTick is one mint's live price payload pushed over the websocket.
type PriceTick struct {
	Price     float64 `json:"price"`
	Change24h float64 `json:"change24h"`
}
