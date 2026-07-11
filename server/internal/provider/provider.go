// Package provider defines the data-source contract. A mock implementation and
// a BirdEye-backed implementation both satisfy it; main picks one by config.
package provider

import (
	"context"

	"solismarket/server/internal/types"
)

type Provider interface {
	Banner(ctx context.Context) ([]types.Token, error)
	Trending(ctx context.Context) ([]types.TrendingToken, error)
	Big() []types.TrendingToken // large caps, computed during Trending
	Token(ctx context.Context, address string) (*types.TokenDetail, error)
	OHLCV(ctx context.Context, address string, tf types.Timeframe) ([]types.OHLCV, error)
	Holders(ctx context.Context, address string) ([]types.Holder, error)
	Trades(ctx context.Context, address string) ([]types.Trade, error)
	Holdings(ctx context.Context, owner string) (*types.WalletHoldings, error)   // wallet balances (on-chain)
	Positions(ctx context.Context, owner string) (*types.WalletPositions, error) // chain-derived cost basis + PnL
	Activity(ctx context.Context, owner string) (*types.WalletActivity, error)   // recent swaps/transfers + deposit/fee totals
	// Broadcast relays a base64-encoded signed transaction to the chain, returning
	// its signature. TxStatus reports a signature's confirmation status.
	Broadcast(ctx context.Context, signedTxB64 string) (string, error)
	TxStatus(ctx context.Context, signature string) (string, error)
	// RPCProxy relays a raw JSON-RPC body to the upstream RPC (so the browser can
	// use it without seeing the key).
	RPCProxy(ctx context.Context, body []byte) ([]byte, error)
}
