package jupiter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
)

const swapURL = "https://lite-api.jup.ag/swap/v1/swap"

// SwapBuild is the (unsigned) swap transaction Jupiter builds for the user to
// sign, plus the block height after which it expires.
type SwapBuild struct {
	SwapTransaction      string `json:"swapTransaction"`
	LastValidBlockHeight uint64 `json:"lastValidBlockHeight"`
}

// BuildSwap fetches a fresh route for the requested swap and asks Jupiter to
// build the transaction for userPubkey to sign. amount is the raw integer input
// amount in the input token's base units (lamports for SOL). The returned
// transaction is unsigned — the client signs it with the embedded wallet and we
// broadcast it via RPC.
func (c *Client) BuildSwap(ctx context.Context, inputMint, outputMint string, amount uint64, slippageBps int, userPubkey string) (*SwapBuild, error) {
	if slippageBps <= 0 {
		slippageBps = 100 // 1% default
	}
	q := url.Values{}
	q.Set("inputMint", inputMint)
	q.Set("outputMint", outputMint)
	q.Set("amount", strconv.FormatUint(amount, 10))
	q.Set("slippageBps", strconv.Itoa(slippageBps))

	var quote json.RawMessage
	if err := c.getJSON(ctx, quoteURL+"?"+q.Encode(), &quote); err != nil {
		return nil, fmt.Errorf("quote: %w", err)
	}

	body, _ := json.Marshal(map[string]any{
		"quoteResponse":           quote,
		"userPublicKey":           userPubkey,
		"dynamicComputeUnitLimit": true,
		// Pay for priority so the swap actually lands in volatile markets, capped
		// so a memecoin swap can't blow the wallet on fees.
		"prioritizationFeeLamports": map[string]any{
			"priorityLevelWithMaxLamports": map[string]any{
				"maxLamports":   2_000_000, // 0.002 SOL ceiling
				"priorityLevel": "high",
			},
		},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, swapURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("accept", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jupiter swap -> %d", res.StatusCode)
	}
	var out SwapBuild
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, err
	}
	if out.SwapTransaction == "" {
		return nil, fmt.Errorf("jupiter swap: empty transaction")
	}
	return &out, nil
}

// getJSON is a small GET helper for the keyless Jupiter API.
func (c *Client) getJSON(ctx context.Context, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("accept", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s -> %d", url, res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}
