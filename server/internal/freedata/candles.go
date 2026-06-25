package freedata

import (
	"sort"

	"chadwallet/server/internal/types"
)

// bucketCandles re-aggregates ascending OHLCV candles into coarser buckets.
func bucketCandles(in []types.OHLCV, sizeSec int64) []types.OHLCV {
	if sizeSec <= 1 || len(in) <= 1 {
		return in
	}
	byB := make(map[int64]*types.OHLCV)
	var order []int64
	for i := range in {
		c := in[i]
		b := (c.Time / sizeSec) * sizeSec
		e, ok := byB[b]
		if !ok {
			cp := c
			cp.Time = b
			byB[b] = &cp
			order = append(order, b)
			continue
		}
		if c.High > e.High {
			e.High = c.High
		}
		if c.Low < e.Low {
			e.Low = c.Low
		}
		e.Close = c.Close
		e.Volume += c.Volume
	}
	sort.Slice(order, func(i, j int) bool { return order[i] < order[j] })
	out := make([]types.OHLCV, 0, len(order))
	for _, b := range order {
		out = append(out, *byB[b])
	}
	return out
}

// dedupeCandles collapses consecutive candles that share a timestamp (the chart
// library requires strictly-ascending, unique times). Assumes ascending input;
// the later row wins. Returns input unchanged when there are no duplicates.
func dedupeCandles(in []types.OHLCV) []types.OHLCV {
	if len(in) < 2 {
		return in
	}
	out := in[:1]
	for _, c := range in[1:] {
		if c.Time == out[len(out)-1].Time {
			out[len(out)-1] = c
			continue
		}
		out = append(out, c)
	}
	return out
}

// lastN keeps only the most recent n candles so the chart's auto-fit always
// frames a sensible window (and the live tail stays visible) regardless of how
// much history accumulated.
func lastN(in []types.OHLCV, n int) []types.OHLCV {
	if n <= 0 || len(in) <= n {
		return in
	}
	return in[len(in)-n:]
}

// trimSince drops candles older than cutoff (unix seconds).
func trimSince(in []types.OHLCV, cutoff int64) []types.OHLCV {
	i := 0
	for i < len(in) && in[i].Time < cutoff {
		i++
	}
	return in[i:]
}

// bucketTrades builds OHLCV candles from raw trades — the source for sub-minute
// timeframes that no free OHLCV endpoint provides.
func bucketTrades(trades []types.Trade, sizeSec int64) []types.OHLCV {
	if len(trades) == 0 {
		return []types.OHLCV{}
	}
	if sizeSec < 1 {
		sizeSec = 1
	}
	ts := append([]types.Trade(nil), trades...)
	sort.Slice(ts, func(i, j int) bool { return ts[i].Timestamp < ts[j].Timestamp })

	byB := make(map[int64]*types.OHLCV)
	var order []int64
	for _, t := range ts {
		if t.PriceUsd <= 0 {
			continue
		}
		b := (t.Timestamp / 1000 / sizeSec) * sizeSec
		e, ok := byB[b]
		if !ok {
			byB[b] = &types.OHLCV{
				Time: b, Open: t.PriceUsd, High: t.PriceUsd, Low: t.PriceUsd,
				Close: t.PriceUsd, Volume: t.AmountUsd,
			}
			order = append(order, b)
			continue
		}
		if t.PriceUsd > e.High {
			e.High = t.PriceUsd
		}
		if t.PriceUsd < e.Low {
			e.Low = t.PriceUsd
		}
		e.Close = t.PriceUsd
		e.Volume += t.AmountUsd
	}
	sort.Slice(order, func(i, j int) bool { return order[i] < order[j] })
	out := make([]types.OHLCV, 0, len(order))
	for _, b := range order {
		out = append(out, *byB[b])
	}
	return out
}
