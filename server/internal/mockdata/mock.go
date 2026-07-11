// Package mockdata implements Provider with deterministic, realistic fake data.
// Used when BIRDEYE_API_KEY is not set, so the backend is runnable with no keys
// and the frontend's live client can be exercised end-to-end.
package mockdata

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"solismarket/server/internal/types"
)

type seed struct {
	address   string
	symbol    string
	name      string
	price     float64
	change24h float64
	change1h  float64
	marketCap float64
	liquidity float64
	volume24h float64
}

var seeds = []seed{
	{"So11111111111111111111111111111111111111112", "SOL", "Solana", 168.42, 4.21, 0.62, 81_400_000_000, 240_000_000, 2_100_000_000},
	{"EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", "WIF", "dogwifhat", 2.31, 12.8, 1.94, 2_300_000_000, 41_000_000, 180_000_000},
	{"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "BONK", "Bonk", 0.0000241, -3.42, 0.18, 1_700_000_000, 33_000_000, 95_000_000},
	{"7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", "POPCAT", "Popcat", 1.42, 22.4, 3.1, 1_390_000_000, 28_000_000, 120_000_000},
	{"MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", "MEW", "cat in a dogs world", 0.0081, 8.9, -0.44, 720_000_000, 19_000_000, 54_000_000},
	{"JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "JUP", "Jupiter", 0.94, 2.1, 0.31, 1_270_000_000, 36_000_000, 88_000_000},
	{"5z3EqYQo9HiCEs3R84RCDMu2n7anpDMxRhdK8PSWmrRC", "BOME", "BOOK OF MEME", 0.0094, -6.7, -1.2, 660_000_000, 14_000_000, 47_000_000},
	{"WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk", "WEN", "Wen", 0.00013, 14.2, 2.7, 49_000_000, 6_400_000, 12_000_000},
	{"HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", "PYTH", "Pyth Network", 0.41, 1.4, 0.08, 1_480_000_000, 22_000_000, 31_000_000},
	{"jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", "JTO", "Jito", 2.18, -2.3, 0.22, 540_000_000, 17_000_000, 24_000_000},
	{"SoLixXo3Vj6Jpr8h7uWNb6gV9CzMy3zJ6fy2rqC8gW1k", "GIGA", "Solking", 0.0412, 41.2, 6.4, 410_000_000, 11_000_000, 38_000_000},
	{"TROLLwpHQjP1xQ8jvKpQ4mD8gV2yC5n9aZ7bXr3kU4j", "TROLL", "Troll", 0.062, 18.4, -2.1, 62_000_000, 4_900_000, 9_400_000},
	{"MoonkCat9aZ7bXr3kU4jHQjP1xQ8jvKpQ4mD8gV2yC5n", "MCAT", "Monkey Cat", 0.0228, -11.3, -3.4, 22_000_000, 2_100_000, 5_600_000},
	{"LoLxBmvKpQ4mD8gV2yC5n9aZ7bXr3kU4jHQjP1xQ8jv", "LOL", "LMAO Coin", 0.0000915, 67.8, 9.2, 9_100_000, 1_400_000, 4_200_000},
}

var traderLabels = []string{
	"Roman 尺", "Zrool 尺", "Cupsey", "Esee", "SolLord", "deepfuckingvalue",
	"moonboy.sol", "ansem", "cented", "Pow", "Mr. Frog", "Euris",
}

const b58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// --- deterministic PRNG (xorshift seeded by FNV hash) ---

func hash(s string) uint32 {
	var h uint32 = 2166136261
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}

type prng struct{ s uint32 }

func newPRNG(seed string) *prng {
	h := hash(seed)
	if h == 0 {
		h = 1
	}
	return &prng{s: h}
}

func (p *prng) next() float64 {
	p.s ^= p.s << 13
	p.s ^= p.s >> 17
	p.s ^= p.s << 5
	return float64(p.s) / float64(math.MaxUint32)
}

func (p *prng) addr() string {
	var b strings.Builder
	for i := 0; i < 44; i++ {
		b.WriteByte(b58[int(p.next()*float64(len(b58)))%len(b58)])
	}
	return b.String()
}

func toToken(s seed) types.Token {
	return types.Token{
		Address: s.address, Symbol: s.symbol, Name: s.name, LogoURI: nil,
		PriceUsd: s.price, Change24h: s.change24h, Change1h: s.change1h,
		MarketCap: s.marketCap, Liquidity: s.liquidity, Volume24h: s.volume24h,
	}
}

func find(address string) seed {
	for _, s := range seeds {
		if s.address == address {
			return s
		}
	}
	return seeds[0]
}

// Provider is the mock data source.
type Provider struct{}

func New() *Provider { return &Provider{} }

func (Provider) Banner(context.Context) ([]types.Token, error) {
	out := make([]types.Token, len(seeds))
	for i, s := range seeds {
		out[i] = toToken(s)
	}
	return out, nil
}

func (Provider) Trending(context.Context) ([]types.TrendingToken, error) {
	out := make([]types.TrendingToken, 0, len(seeds))
	// sort by volume desc
	sorted := append([]seed(nil), seeds...)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].volume24h > sorted[i].volume24h {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}
	for i, s := range sorted {
		out = append(out, types.TrendingToken{
			Token: toToken(s), Rank: i + 1, Sparkline: sparkline(s),
		})
	}
	return out, nil
}

// Holdings returns an empty demo wallet (mock mode has no chain).
func (Provider) Holdings(_ context.Context, _ string) (*types.WalletHoldings, error) {
	return &types.WalletHoldings{SolBalance: 10, Tokens: []types.TokenBalance{}}, nil
}

// Positions has no chain history in mock mode.
func (Provider) Positions(_ context.Context, _ string) (*types.WalletPositions, error) {
	return &types.WalletPositions{Positions: []types.Position{}}, nil
}

// Activity has no chain history in mock mode.
func (Provider) Activity(_ context.Context, _ string) (*types.WalletActivity, error) {
	return &types.WalletActivity{Items: []types.ActivityItem{}}, nil
}

// Broadcast/TxStatus aren't supported in mock mode (no chain).
func (Provider) Broadcast(_ context.Context, _ string) (string, error) {
	return "", errors.New("swaps are not available in mock mode")
}

func (Provider) TxStatus(_ context.Context, _ string) (string, error) {
	return "", errors.New("swaps are not available in mock mode")
}

func (Provider) RPCProxy(_ context.Context, _ []byte) ([]byte, error) {
	return nil, errors.New("rpc is not available in mock mode")
}

// Big returns the large-cap subset of the mock trending list.
func (p Provider) Big() []types.TrendingToken {
	tr, _ := p.Trending(context.Background())
	big := make([]types.TrendingToken, 0, len(tr))
	for _, t := range tr {
		if t.MarketCap >= 10_000_000 {
			t.Rank = len(big) + 1
			big = append(big, t)
		}
	}
	return big
}

func sparkline(s seed) []float64 {
	r := newPRNG(s.address + "spark")
	drift := s.change24h / 100
	const n = 24
	out := make([]float64, n)
	p := s.price / (1 + drift)
	for i := 0; i < n; i++ {
		p *= 1 + drift/n + (r.next()-0.5)*0.04
		out[i] = p
	}
	out[n-1] = s.price
	return out
}

func (Provider) Token(_ context.Context, address string) (*types.TokenDetail, error) {
	s := find(address)
	r := newPRNG(s.address + "detail")
	holders := buildHolders(s)
	top10 := 0.0
	for i := 0; i < 10 && i < len(holders); i++ {
		top10 += holders[i].Pct
	}
	desc := fmt.Sprintf("%s ($%s) is a community-driven token trading on Solana.", s.name, s.symbol)
	tw := "https://x.com/" + strings.ToLower(s.symbol)
	d := &types.TokenDetail{
		Token:       toToken(s),
		FDV:         s.marketCap * (1 + r.next()*0.15),
		TotalSupply: s.marketCap / s.price,
		HolderCount: int(2000 + r.next()*60000),
		Top10Pct:    top10,
		Description: &desc,
		Website:     nil,
		Twitter:     &tw,
	}
	return d, nil
}

var tfConfig = map[types.Timeframe]struct {
	points  int
	stepSec int64
}{
	types.Tf1s:  {120, 1},
	types.Tf5s:  {120, 5},
	types.Tf30s: {120, 30},
	types.Tf1m:  {120, 60},
	types.Tf10m: {120, 600},
	types.Tf1h:  {120, 3600},
	types.Tf4h:  {120, 14400},
}

func (Provider) OHLCV(_ context.Context, address string, tf types.Timeframe) ([]types.OHLCV, error) {
	s := find(address)
	cfg, ok := tfConfig[tf]
	if !ok {
		cfg = tfConfig[types.Tf1m]
	}
	r := newPRNG(s.address + string(tf))
	endSec := (time.Now().Unix() / cfg.stepSec) * cfg.stepSec
	vol := 0.05
	if tf.BucketSeconds() <= 60 {
		vol = 0.012
	}
	closes := make([]float64, cfg.points)
	price := s.price
	for i := cfg.points - 1; i >= 0; i-- {
		closes[i] = price
		ret := (r.next()-0.5)*2*vol + (s.change24h/100)*(vol/6)
		price = price / (1 + ret)
	}
	out := make([]types.OHLCV, cfg.points)
	for i := 0; i < cfg.points; i++ {
		c := closes[i]
		o := c * (1 + (r.next()-0.5)*vol)
		if i > 0 {
			o = closes[i-1]
		}
		hi := math.Max(o, c) * (1 + r.next()*vol*0.8)
		lo := math.Min(o, c) * (1 - r.next()*vol*0.8)
		out[i] = types.OHLCV{
			Time:   endSec - int64(cfg.points-1-i)*cfg.stepSec,
			Open:   o, High: hi, Low: lo, Close: c,
			Volume: (s.volume24h / float64(cfg.points)) * (0.4 + r.next()),
		}
	}
	return out, nil
}

func buildHolders(s seed) []types.Holder {
	r := newPRNG(s.address + "holders")
	total := s.marketCap / s.price
	const count = 28
	out := make([]types.Holder, 0, count)
	remaining := 64.0
	for i := 0; i < count; i++ {
		var share float64
		if i < 3 {
			share = remaining * (0.18 + r.next()*0.1)
		} else {
			share = remaining * (0.03 + r.next()*0.05)
		}
		pct := math.Max(0.05, math.Min(share, remaining))
		remaining = math.Max(0, remaining-pct)
		out = append(out, types.Holder{
			Rank: i + 1, Address: r.addr(), Pct: pct,
			ValueUsd: pct / 100 * s.marketCap, TokenAmount: pct / 100 * total,
		})
	}
	return out
}

func (Provider) Holders(_ context.Context, address string) ([]types.Holder, error) {
	return buildHolders(find(address)), nil
}

func (Provider) Trades(_ context.Context, address string) ([]types.Trade, error) {
	s := find(address)
	r := newPRNG(s.address + strconv.FormatInt(time.Now().Unix()/4, 10))
	buyBias := 0.5 + math.Max(-0.25, math.Min(0.25, s.change24h/200))
	const n = 40
	out := make([]types.Trade, 0, n)
	t := time.Now().UnixMilli()
	for i := 0; i < n; i++ {
		side := "sell"
		if r.next() < buyBias {
			side = "buy"
		}
		usd := math.Exp(r.next()*6) * 12
		t -= int64(r.next()*14000) + 800
		var label *string
		if r.next() < 0.4 {
			l := traderLabels[int(r.next()*float64(len(traderLabels)))%len(traderLabels)]
			label = &l
		}
		hashStr := r.addr()
		out = append(out, types.Trade{
			ID: fmt.Sprintf("%s-%d-%d", s.address, i, t), Side: side,
			Trader: r.addr(), TraderLabel: label, AmountUsd: usd,
			TokenAmount: usd / s.price, PriceUsd: s.price * (1 + (r.next()-0.5)*0.01),
			Timestamp: t, TxHash: &hashStr,
		})
	}
	return out, nil
}
