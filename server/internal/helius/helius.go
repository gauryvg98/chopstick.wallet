// Package helius pulls data BirdEye's free tier gates — primarily real token
// holders via the standard Solana RPC getTokenLargestAccounts, resolved to
// owner wallets with getMultipleAccounts. Runs in parallel with BirdEye so the
// two free tiers share the load.
package helius

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strconv"
	"sync"
	"time"

	"chadwallet/server/internal/types"
)

const rpcBase = "https://mainnet.helius-rpc.com/?api-key="

type Client struct {
	url         string
	key         string
	http        *http.Client
	mu          sync.Mutex
	last        time.Time
	minInterval time.Duration

	txMu    sync.Mutex
	txCache map[string]txCacheEntry // owner -> recent enhanced txs (shared by positions + activity)
}

type txCacheEntry struct {
	txs []enhancedTx
	at  time.Time
}

func New(apiKey string) *Client {
	return &Client{
		url:         rpcBase + apiKey,
		key:         apiKey,
		http:        &http.Client{Timeout: 15 * time.Second},
		minInterval: 300 * time.Millisecond,
	}
}

func (c *Client) throttle() {
	c.mu.Lock()
	if wait := time.Until(c.last.Add(c.minInterval)); wait > 0 {
		time.Sleep(wait)
	}
	c.last = time.Now()
	c.mu.Unlock()
}

func (c *Client) rpc(ctx context.Context, method string, params any, out any) error {
	payload, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0", "id": "cw", "method": method, "params": params,
	})
	c.throttle()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("helius %s -> %d", method, res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// Token program ids. Wallets can hold tokens under the classic SPL Token program
// or the newer Token-2022 program, so we query both to catch every balance.
const (
	tokenProgram     = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
	token2022Program = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
)

// Holdings reads a wallet's on-chain balances: SOL plus every SPL token it holds
// (both Token and Token-2022 programs). The chain is the source of truth for
// positions — no DB needed.
func (c *Client) Holdings(ctx context.Context, owner string) (*types.WalletHoldings, error) {
	out := &types.WalletHoldings{Tokens: []types.TokenBalance{}}

	var bal struct {
		Result struct {
			Value uint64 `json:"value"`
		} `json:"result"`
	}
	// "confirmed" commitment so a just-confirmed swap is reflected immediately
	// (the default is "finalized", which lags ~13s behind).
	if err := c.rpc(ctx, "getBalance", []any{owner, map[string]any{"commitment": "confirmed"}}, &bal); err == nil {
		out.SolBalance = float64(bal.Result.Value) / 1e9
	}

	// Query both token programs; merge by mint (a wallet won't hold the same mint
	// under both, but dedupe defensively).
	seen := map[string]bool{}
	var firstErr error
	for _, prog := range []string{tokenProgram, token2022Program} {
		toks, err := c.tokenAccounts(ctx, owner, prog)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		for _, t := range toks {
			if seen[t.Mint] {
				continue
			}
			seen[t.Mint] = true
			out.Tokens = append(out.Tokens, t)
		}
	}
	// Only surface an error if BOTH lookups failed and we found nothing.
	if len(out.Tokens) == 0 && firstErr != nil {
		return out, firstErr
	}
	return out, nil
}

// tokenAccounts returns the non-zero token balances a wallet holds under one
// token program.
func (c *Client) tokenAccounts(ctx context.Context, owner, programID string) ([]types.TokenBalance, error) {
	var ta struct {
		Result struct {
			Value []struct {
				Account struct {
					Data struct {
						Parsed struct {
							Info struct {
								Mint        string `json:"mint"`
								TokenAmount struct {
									UIAmount float64 `json:"uiAmount"`
									Amount   string `json:"amount"`
									Decimals int    `json:"decimals"`
								} `json:"tokenAmount"`
							} `json:"info"`
						} `json:"parsed"`
					} `json:"data"`
				} `json:"account"`
			} `json:"value"`
		} `json:"result"`
	}
	params := []any{
		owner,
		map[string]string{"programId": programID},
		map[string]string{"encoding": "jsonParsed", "commitment": "confirmed"},
	}
	if err := c.rpc(ctx, "getTokenAccountsByOwner", params, &ta); err != nil {
		return nil, err
	}
	out := make([]types.TokenBalance, 0, len(ta.Result.Value))
	for _, v := range ta.Result.Value {
		info := v.Account.Data.Parsed.Info
		if info.Mint == "" || info.TokenAmount.UIAmount <= 0 {
			continue
		}
		out = append(out, types.TokenBalance{
			Mint:      info.Mint,
			Amount:    info.TokenAmount.UIAmount,
			RawAmount: info.TokenAmount.Amount,
			Decimals:  info.TokenAmount.Decimals,
		})
	}
	return out, nil
}

// Forward proxies a raw JSON-RPC request body to the Helius RPC and returns the
// raw response. Lets the frontend (Privy's signer) use our RPC without ever
// seeing the API key — the browser talks to our /api/rpc, we relay to Helius.
func (c *Client) Forward(ctx context.Context, body []byte) ([]byte, error) {
	c.throttle()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	out, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return out, fmt.Errorf("helius rpc -> %d", res.StatusCode)
	}
	return out, nil
}

// enhancedTx is one parsed transaction from Helius's Enhanced Transactions API.
type enhancedTx struct {
	Signature        string          `json:"signature"`
	Timestamp        int64           `json:"timestamp"`
	Fee              int64           `json:"fee"`
	FeePayer         string          `json:"feePayer"`
	TransactionError json.RawMessage `json:"transactionError"`
	AccountData      []struct {
		Account             string `json:"account"`
		NativeBalanceChange int64  `json:"nativeBalanceChange"`
		TokenBalanceChanges []struct {
			UserAccount    string `json:"userAccount"`
			Mint           string `json:"mint"`
			RawTokenAmount struct {
				TokenAmount string `json:"tokenAmount"`
				Decimals    int    `json:"decimals"`
			} `json:"rawTokenAmount"`
		} `json:"tokenBalanceChanges"`
	} `json:"accountData"`
}

// Positions reconstructs per-token cost basis from the wallet's on-chain swap
// history — avg entry + realized PnL, all in SOL. The chain is the ledger: each
// swap's owner SOL delta is the cost/proceeds and the token delta is the size.
// No DB, and it's correct across devices because it's just the wallet's history.
//
// Uses Helius's Enhanced Transactions API (one call returns 100 parsed txs with
// per-account balance changes — free tier, no RPC batching needed).
// enhancedTxs fetches the wallet's recent parsed transactions, cached briefly so
// the positions + activity endpoints share one (slow) upstream call.
func (c *Client) enhancedTxs(ctx context.Context, owner string) ([]enhancedTx, error) {
	c.txMu.Lock()
	if e, ok := c.txCache[owner]; ok && time.Since(e.at) < 30*time.Second {
		c.txMu.Unlock()
		return e.txs, nil
	}
	c.txMu.Unlock()

	url := "https://api.helius.xyz/v0/addresses/" + owner + "/transactions?api-key=" + c.key + "&limit=100"
	c.throttle()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("helius enhanced txs -> %d", res.StatusCode)
	}
	var txs []enhancedTx
	if err := json.NewDecoder(res.Body).Decode(&txs); err != nil {
		return nil, err
	}
	c.txMu.Lock()
	if c.txCache == nil {
		c.txCache = map[string]txCacheEntry{}
	}
	c.txCache[owner] = txCacheEntry{txs: txs, at: time.Now()}
	c.txMu.Unlock()
	return txs, nil
}

func (c *Client) Positions(ctx context.Context, owner string) (*types.WalletPositions, error) {
	out := &types.WalletPositions{Positions: []types.Position{}}
	txs, err := c.enhancedTxs(ctx, owner)
	if err != nil {
		return nil, err
	}
	txs = append([]enhancedTx(nil), txs...)                                              // copy before sorting the shared slice
	sort.Slice(txs, func(i, j int) bool { return txs[i].Timestamp < txs[j].Timestamp }) // oldest first

	type acc struct{ qty, costSol, realized, realizedCost, bought, sold float64 }
	books := map[string]*acc{}
	for _, tx := range txs {
		if len(tx.TransactionError) > 0 && string(tx.TransactionError) != "null" {
			continue
		}
		// Owner's native SOL change (lamports): what was spent (buy) or received
		// (sell), fees included.
		var solDelta float64
		deltas := map[string]float64{}
		for _, ad := range tx.AccountData {
			if ad.Account == owner {
				solDelta += float64(ad.NativeBalanceChange) / 1e9
			}
			for _, tc := range ad.TokenBalanceChanges {
				if tc.UserAccount != owner {
					continue
				}
				raw, _ := strconv.ParseFloat(tc.RawTokenAmount.TokenAmount, 64)
				deltas[tc.Mint] += raw / math.Pow10(tc.RawTokenAmount.Decimals)
			}
		}
		for m, delta := range deltas {
			a := books[m]
			if a == nil {
				a = &acc{}
				books[m] = a
			}
			if delta > 1e-9 { // acquired this token
				solSpent := 0.0
				if solDelta < -1e-7 { // real SOL went out (a SOL→token buy)
					solSpent = -solDelta
				}
				a.qty += delta
				a.costSol += solSpent
				a.bought += delta
			} else if delta < -1e-9 { // disposed this token
				sellQty := -delta
				avg := 0.0
				if a.qty > 1e-12 {
					avg = a.costSol / a.qty
				}
				costOfSold := avg * sellQty
				solRecv := 0.0
				if solDelta > 1e-7 { // real SOL came in (a token→SOL sell)
					solRecv = solDelta
				}
				a.realized += solRecv - costOfSold
				a.realizedCost += costOfSold
				a.qty -= sellQty
				a.costSol -= costOfSold
				a.sold += sellQty
				if a.qty < 0 {
					a.qty = 0
				}
				if a.costSol < 0 {
					a.costSol = 0
				}
			}
		}
	}

	for m, a := range books {
		if a.bought <= 1e-9 { // ignore tokens we never actually bought (dust/airdrops)
			continue
		}
		avg := 0.0
		if a.qty > 1e-12 {
			avg = a.costSol / a.qty
		}
		out.Positions = append(out.Positions, types.Position{
			Mint: m, AvgEntrySol: avg, RealizedSol: a.realized,
			RealizedCostSol: a.realizedCost,
			BoughtQty:       a.bought, SoldQty: a.sold,
		})
		out.RealizedSol += a.realized
	}
	return out, nil
}

// Activity returns the wallet's recent on-chain actions (swaps, deposits,
// transfers) plus lifetime SOL-deposited and fees-paid totals — from the same
// (cached) Enhanced-API fetch as Positions.
func (c *Client) Activity(ctx context.Context, owner string) (*types.WalletActivity, error) {
	out := &types.WalletActivity{Items: []types.ActivityItem{}}
	txs, err := c.enhancedTxs(ctx, owner)
	if err != nil {
		return nil, err
	}
	for _, tx := range txs { // API returns newest-first
		failed := len(tx.TransactionError) > 0 && string(tx.TransactionError) != "null"
		feeSol := 0.0
		if tx.FeePayer == owner {
			feeSol = float64(tx.Fee) / 1e9
			out.FeesSol += feeSol
		}

		var solDelta float64
		deltas := map[string]float64{}
		for _, ad := range tx.AccountData {
			if ad.Account == owner {
				solDelta += float64(ad.NativeBalanceChange) / 1e9
			}
			for _, tc := range ad.TokenBalanceChanges {
				if tc.UserAccount != owner {
					continue
				}
				raw, _ := strconv.ParseFloat(tc.RawTokenAmount.TokenAmount, 64)
				deltas[tc.Mint] += raw / math.Pow10(tc.RawTokenAmount.Decimals)
			}
		}
		// The token with the largest move is the one this action is "about".
		var mint string
		var tok float64
		for m, d := range deltas {
			if math.Abs(d) > math.Abs(tok) {
				mint, tok = m, d
			}
		}

		it := types.ActivityItem{Signature: tx.Signature, Timestamp: tx.Timestamp, FeeSol: feeSol, Failed: failed}
		switch {
		case tok > 1e-9 && solDelta < -1e-7: // SOL → token
			it.Kind, it.Mint, it.TokenAmount, it.SolAmount = "buy", mint, tok, -solDelta
		case tok < -1e-9 && solDelta > 1e-7: // token → SOL
			it.Kind, it.Mint, it.TokenAmount, it.SolAmount = "sell", mint, -tok, solDelta
		case tok > 1e-9: // token in, ~no SOL move
			it.Kind, it.Mint, it.TokenAmount = "receive", mint, tok
		case tok < -1e-9: // token out
			it.Kind, it.Mint, it.TokenAmount = "send", mint, -tok
		case solDelta > 1e-5: // SOL in, no token (ignore sub-dust refunds)
			it.Kind, it.SolAmount = "deposit", solDelta
			out.Deposited += solDelta
		case solDelta < -1e-5-feeSol: // SOL out beyond just the fee
			amt := -solDelta - feeSol
			it.Kind, it.SolAmount = "withdraw", amt
			out.Withdrawn += amt
		default:
			continue // fee-only / dust — keep it out of the feed
		}
		out.Items = append(out.Items, it)
	}
	if len(out.Items) > 40 {
		out.Items = out.Items[:40]
	}
	return out, nil
}

// SendTransaction broadcasts a base64-encoded signed transaction and returns its
// signature. The transaction is signed client-side by the embedded wallet; we
// only relay it to the chain (keeping the RPC key server-side).
func (c *Client) SendTransaction(ctx context.Context, signedB64 string) (string, error) {
	var r struct {
		Result string `json:"result"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	params := []any{
		signedB64,
		map[string]any{"encoding": "base64", "skipPreflight": true, "maxRetries": 5},
	}
	if err := c.rpc(ctx, "sendTransaction", params, &r); err != nil {
		return "", err
	}
	if r.Error != nil {
		return "", fmt.Errorf("sendTransaction: %s", r.Error.Message)
	}
	if r.Result == "" {
		return "", fmt.Errorf("sendTransaction: empty signature")
	}
	return r.Result, nil
}

// SignatureStatus returns a transaction's confirmation status: "pending",
// "processed", "confirmed", "finalized", or "failed".
func (c *Client) SignatureStatus(ctx context.Context, sig string) (string, error) {
	var r struct {
		Result struct {
			Value []*struct {
				ConfirmationStatus string          `json:"confirmationStatus"`
				Err                json.RawMessage `json:"err"`
			} `json:"value"`
		} `json:"result"`
	}
	params := []any{
		[]string{sig},
		map[string]any{"searchTransactionHistory": true},
	}
	if err := c.rpc(ctx, "getSignatureStatuses", params, &r); err != nil {
		return "", err
	}
	v := r.Result.Value
	if len(v) == 0 || v[0] == nil {
		return "pending", nil
	}
	if len(v[0].Err) > 0 && string(v[0].Err) != "null" {
		return "failed", nil
	}
	if v[0].ConfirmationStatus == "" {
		return "pending", nil
	}
	return v[0].ConfirmationStatus, nil
}

// Holders returns the top token holders for a mint (token accounts resolved to
// owner wallets), with pct/value computed from the supplied supply + price.
func (c *Client) Holders(ctx context.Context, mint string, supply, price, marketCap float64) ([]types.Holder, error) {
	var la struct {
		Result struct {
			Value []struct {
				Address  string  `json:"address"`
				UIAmount float64 `json:"uiAmount"`
			} `json:"value"`
		} `json:"result"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := c.rpc(ctx, "getTokenLargestAccounts", []any{mint}, &la); err != nil {
		return nil, err
	}
	if la.Error != nil {
		return nil, fmt.Errorf("helius getTokenLargestAccounts: %s", la.Error.Message)
	}
	if len(la.Result.Value) == 0 {
		return nil, fmt.Errorf("helius: no token accounts for %s", mint)
	}

	addrs := make([]string, 0, len(la.Result.Value))
	for _, v := range la.Result.Value {
		addrs = append(addrs, v.Address)
	}

	// Resolve each token account to its owner wallet.
	var ma struct {
		Result struct {
			Value []*struct {
				Data struct {
					Parsed struct {
						Info struct {
							Owner       string `json:"owner"`
							TokenAmount struct {
								UIAmount float64 `json:"uiAmount"`
							} `json:"tokenAmount"`
						} `json:"info"`
					} `json:"parsed"`
				} `json:"data"`
			} `json:"value"`
		} `json:"result"`
	}
	_ = c.rpc(ctx, "getMultipleAccounts", []any{addrs, map[string]any{"encoding": "jsonParsed"}}, &ma)

	out := make([]types.Holder, 0, len(la.Result.Value))
	seen := make(map[string]bool)
	for i, v := range la.Result.Value {
		owner := v.Address // fall back to the token-account address
		ui := v.UIAmount
		if i < len(ma.Result.Value) && ma.Result.Value[i] != nil {
			if o := ma.Result.Value[i].Data.Parsed.Info.Owner; o != "" {
				owner = o
			}
			if a := ma.Result.Value[i].Data.Parsed.Info.TokenAmount.UIAmount; a > 0 {
				ui = a
			}
		}
		if seen[owner] { // one owner may hold several token accounts
			continue
		}
		seen[owner] = true
		pct := 0.0
		if supply > 0 {
			pct = ui / supply * 100
		}
		// Value from pct × marketCap (the two reliable aggregates), NOT ui × price:
		// some tokens report a TotalSupply whose scale disagrees with the on-chain
		// uiAmount, which leaves the ratio (pct) sane but blows up ui × price into
		// absurd numbers. Fall back to ui × price only when we have no market cap.
		val := ui * price
		if marketCap > 0 && supply > 0 {
			val = ui / supply * marketCap
		}
		out = append(out, types.Holder{
			Rank: len(out) + 1, Address: owner, Pct: pct,
			ValueUsd: val, TokenAmount: ui,
		})
	}
	return out, nil
}
