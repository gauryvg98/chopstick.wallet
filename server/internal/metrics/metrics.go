// Package metrics is a tiny in-memory latency registry: record a duration (and
// whether it errored) under a named series, and read back rolling stats
// (count, error rate, avg/p50/p95/max, recent samples) for a status dashboard.
package metrics

import (
	"sort"
	"sync"
	"time"
)

const window = 120 // recent samples kept per series

type series struct {
	samples []float64 // recent latencies, ms (chronological ring)
	count   int64
	errors  int64
	last    float64
}

// Registry holds named latency series, safe for concurrent use.
type Registry struct {
	mu     sync.Mutex
	s      map[string]*series
	labels map[string]string
	order  []string // stable display order (registration order)
}

func New() *Registry {
	return &Registry{s: map[string]*series{}, labels: map[string]string{}}
}

// Label registers a human-readable name + display order for a series.
func (r *Registry) Label(name, label string) {
	r.mu.Lock()
	if _, ok := r.labels[name]; !ok {
		r.order = append(r.order, name)
	}
	r.labels[name] = label
	r.mu.Unlock()
}

// Observe records one operation's latency (and whether it errored).
func (r *Registry) Observe(name string, d time.Duration, err error) {
	ms := float64(d.Microseconds()) / 1000.0
	r.mu.Lock()
	defer r.mu.Unlock()
	se := r.s[name]
	if se == nil {
		se = &series{}
		r.s[name] = se
	}
	se.count++
	if err != nil {
		se.errors++
	}
	se.last = ms
	se.samples = append(se.samples, ms)
	if len(se.samples) > window {
		se.samples = se.samples[len(se.samples)-window:]
	}
}

// Stat is the rolling summary of one series.
type Stat struct {
	Name   string    `json:"name"`
	Label  string    `json:"label"`
	Count  int64     `json:"count"`
	Errors int64     `json:"errors"`
	LastMs float64   `json:"lastMs"`
	AvgMs  float64   `json:"avgMs"`
	P50Ms  float64   `json:"p50Ms"`
	P95Ms  float64   `json:"p95Ms"`
	MaxMs  float64   `json:"maxMs"`
	Recent []float64 `json:"recent"` // last ~40 samples for a sparkline
}

// Snapshot returns current stats in registration order.
func (r *Registry) Snapshot() []Stat {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]Stat, 0, len(r.order))
	for _, name := range r.order {
		se := r.s[name]
		st := Stat{Name: name, Label: r.labels[name], Recent: []float64{}}
		if se == nil {
			out = append(out, st)
			continue
		}
		st.Count, st.Errors, st.LastMs = se.count, se.errors, se.last
		if n := len(se.samples); n > 0 {
			sorted := append([]float64(nil), se.samples...)
			sort.Float64s(sorted)
			var sum float64
			for _, v := range sorted {
				sum += v
			}
			st.AvgMs = sum / float64(n)
			st.P50Ms = sorted[n*50/100]
			p95 := n * 95 / 100
			if p95 >= n {
				p95 = n - 1
			}
			st.P95Ms = sorted[p95]
			st.MaxMs = sorted[n-1]
			if n > 40 {
				st.Recent = se.samples[n-40:]
			} else {
				st.Recent = se.samples
			}
		}
		out = append(out, st)
	}
	return out
}
