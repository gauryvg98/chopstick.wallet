"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useOHLCV } from "@/lib/api/hooks";
import { useCandleStream } from "@/lib/livePrices";
import { formatCompactUsd } from "@/lib/format";
import type { OHLCV, Timeframe } from "@/lib/api/types";

export type ChartKind = "candle" | "line";
export type ChartMetric = "price" | "mcap";

const BUCKET_SECONDS: Record<Timeframe, number> = {
  "1s": 1,
  "5s": 5,
  "30s": 30,
  "1m": 60,
  "10m": 600,
  "1h": 3600,
  "4h": 14400,
};

const UP = "#22e07b"; // spring green — brand accent
const DOWN = "#ff5765"; // refined red
const VOL_UP = "rgba(34,224,123,0.45)";
const VOL_DOWN = "rgba(255,87,101,0.45)";

function precisionFor(price: number): number {
  return price >= 100 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 6 : 9;
}

/** Format a value for the OHLC legend, matching the active metric. */
function fmtVal(v: number, metric: ChartMetric): string {
  if (metric === "mcap") return formatCompactUsd(v);
  const p = precisionFor(v);
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: p });
}

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Coerce to strictly-ascending, unique timestamps (the lib asserts on dupes). */
function cleanBars(data: OHLCV[]): Bar[] {
  const out: Bar[] = [];
  let prev = -Infinity;
  for (const d of data) {
    const b = { time: d.time, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume ?? 0 };
    if (d.time < prev) continue;
    if (d.time === prev) {
      out[out.length - 1] = b;
      continue;
    }
    out.push(b);
    prev = d.time;
  }
  return out;
}

export function PriceChart({
  address,
  tf,
  fast,
  kind = "candle",
  metric = "price",
  supply = 0,
  symbol = "",
}: {
  address: string;
  tf: Timeframe;
  fast?: boolean;
  kind?: ChartKind;
  metric?: ChartMetric;
  supply?: number;
  symbol?: string;
}) {
  // Market cap = price × supply. When in "mcap" mode every value is scaled so the
  // y-axis reads the market cap instead of the raw price. Volume is never scaled.
  const scale = metric === "mcap" && supply > 0 ? supply : 1;
  const scaleBar = (b: Bar): Bar =>
    scale === 1
      ? b
      : {
          time: b.time,
          open: b.open * scale,
          high: b.high * scale,
          low: b.low * scale,
          close: b.close * scale,
          volume: b.volume,
        };
  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area" | "Candlestick"> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastBarRef = useRef<Bar | null>(null);
  // The current authoritative bars, so the crosshair legend can read full OHLC at
  // any hovered time regardless of whether the visible series is candle or line.
  const barsRef = useRef<Bar[]>([]);
  // How many bars the series currently holds — so a transient short payload from
  // the backend (a cold-start fallback, a cache-expiry hiccup) can never wipe a
  // healthy chart down to a handful of bars on reconcile.
  const barsLenRef = useRef(0);
  // Identifies the current (token, timeframe, kind). When it changes we fit the
  // view; otherwise we preserve the user's zoom/pan across reconciles.
  const viewKeyRef = useRef<string>("");
  // Keep the latest formatting context available to the crosshair handler.
  const ctxRef = useRef({ symbol, tf, metric });
  ctxRef.current = { symbol, tf, metric };
  const { data, isLoading } = useOHLCV(address, tf, fast);
  const [streamed, setStreamed] = useState(false);
  // Reset the "got a live bar" flag whenever the token/timeframe changes.
  useEffect(() => setStreamed(false), [address, tf]);
  const empty = (!data || data.length === 0) && !streamed;

  // Paint the OHLC legend for a given bar (the hovered one, else the latest).
  const paintLegend = (bar: Bar | null) => {
    const el = legendRef.current;
    if (!el) return;
    const { symbol: sym, tf: t, metric: m } = ctxRef.current;
    if (!bar) {
      el.innerHTML = "";
      return;
    }
    const up = bar.close >= bar.open;
    const col = up ? UP : DOWN;
    const chg = bar.open > 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0;
    const v = (n: number) => `<span style="color:${col}">${fmtVal(n, m)}</span>`;
    el.innerHTML =
      `<span style="color:#6b7280">${sym || "—"} · ${t} · chad</span>` +
      ` <span style="color:#6b7280">O</span>${v(bar.open)}` +
      ` <span style="color:#6b7280">H</span>${v(bar.high)}` +
      ` <span style="color:#6b7280">L</span>${v(bar.low)}` +
      ` <span style="color:#6b7280">C</span>${v(bar.close)}` +
      ` <span style="color:${col}">${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%</span>` +
      (bar.volume > 0 ? ` <span style="color:#6b7280">Vol</span> <span style="color:#8a909b">${formatCompactUsd(bar.volume)}</span>` : "");
  };

  // Live head: the backend streams the forming candle for this (token, tf) over
  // the websocket. We just apply each bar — update() touches only the last bar,
  // so it never refits and the user's zoom is preserved. No polling.
  useCandleStream(address, tf, (raw) => {
    const series = seriesRef.current;
    if (!series) return;
    // #1: don't paint the live bar until the (cached) history window has loaded,
    // so you never see a lone candle flicker before the full window appears.
    if (data === undefined) return;
    setStreamed(true);
    const prevVol = lastBarRef.current?.volume ?? 0;
    const incoming = scaleBar({ time: raw.time, open: raw.open, high: raw.high, low: raw.low, close: raw.close, volume: prevVol });
    const last = lastBarRef.current;
    // The live stream (Jupiter, current minute) and the history (GeckoTerminal,
    // which lags real-time by a few minutes) are different price sources, so the
    // raw open of a new candle can jump at the seam. Resolve both cases against
    // the previous candle's close:
    //  #2a same bucket  → extend (keep open, widen high/low, move close) so the
    //      forming candle doesn't collapse to a line.
    //  #2b new bucket   → open AT the previous close, so the live edge stays
    //      continuous with history (and across every rollover) instead of
    //      teleporting to wherever the live source happens to price it.
    const bar: Bar =
      last && incoming.time === last.time
        ? {
            time: last.time,
            open: last.open,
            high: Math.max(last.high, incoming.high),
            low: Math.min(last.low, incoming.low),
            close: incoming.close,
            volume: last.volume,
          }
        : last
        ? {
            time: incoming.time,
            open: last.close,
            high: Math.max(incoming.high, last.close),
            low: Math.min(incoming.low, last.close),
            close: incoming.close,
            volume: 0,
          }
        : incoming;
    lastBarRef.current = bar;
    paintLegend(bar);
    try {
      if (kind === "candle") {
        series.update(bar as never);
      } else {
        series.update({ time: bar.time as UTCTimestamp, value: bar.close } as never);
      }
    } catch {
      /* bar raced a setData reset / arrived out of order — next bar recovers */
    }
  });

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8a909b",
        fontFamily: "var(--font-inter), sans-serif",
        attributionLogo: true, // TradingView attribution mark (like fomo)
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.025)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "#3a4150", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#22e07b" },
        horzLine: { color: "#3a4150", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#22e07b" },
      },
      rightPriceScale: { borderColor: "#262a31", scaleMargins: { top: 0.1, bottom: 0.26 } },
      timeScale: { borderColor: "#262a31", timeVisible: true, secondsVisible: false, rightOffset: 4 },
      autoSize: true,
      // Zoom + pan: wheel to zoom, drag to pan, pinch on touch.
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    });
    chartRef.current = chart;

    // The attribution logo ships with no tooltip; label it "Charts by TradingView"
    // (fomo-style) once the library has injected it into the container.
    const labelLogo = () => {
      const a = el.querySelector<HTMLAnchorElement>('a[href*="tradingview.com"]');
      if (a) a.title = "Charts by TradingView";
    };
    labelLogo();
    const logoTid = setTimeout(labelLogo, 300);

    // Volume histogram — its own overlay scale pinned to the bottom strip, so it
    // sits under the candles like fomo's chart.
    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volSeriesRef.current = vol;

    // OHLC legend follows the crosshair; falls back to the latest bar.
    const onMove = (param: { time?: unknown }) => {
      if (param.time == null) {
        paintLegend(lastBarRef.current);
        return;
      }
      const bars = barsRef.current;
      // bars are time-ascending; find the hovered one.
      const t = param.time as number;
      let hit: Bar | null = null;
      for (let i = bars.length - 1; i >= 0; i--) {
        if (bars[i].time === t) { hit = bars[i]; break; }
        if (bars[i].time < t) { hit = bars[i]; break; }
      }
      paintLegend(hit ?? lastBarRef.current);
    };
    chart.subscribeCrosshairMove(onMove);

    // Double-click anywhere to reset the zoom.
    const reset = () => chart.timeScale().fitContent();
    chart.subscribeDblClick(reset);
    return () => {
      clearTimeout(logoTid);
      chart.unsubscribeDblClick(reset);
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volSeriesRef.current = null;
    };
  }, []);

  // (Re)create the price series whenever the chart kind changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const series =
      kind === "candle"
        ? chart.addSeries(CandlestickSeries, {
            upColor: UP,
            downColor: DOWN,
            borderVisible: false, // cleaner, modern bodies
            wickUpColor: "rgba(34,224,123,0.85)",
            wickDownColor: "rgba(255,87,101,0.85)",
            priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
          })
        : chart.addSeries(AreaSeries, {
            lineColor: UP,
            topColor: "rgba(34,224,123,0.28)",
            bottomColor: "rgba(34,224,123,0.02)",
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
          });
    seriesRef.current = series;
    viewKeyRef.current = ""; // force a fit on next data for the new series
    return () => {
      try {
        chart.removeSeries(series);
      } catch {
        /* chart already torn down */
      }
      seriesRef.current = null;
    };
  }, [kind]);

  // Push fetched data. Fresh (token/tf/kind) → set + fit once. Reconcile →
  // re-set authoritative candles but RESTORE the user's zoom so the view never
  // jumps. The live head (below) keeps the latest candle moving between these.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    const key = `${address}|${tf}|${kind}|${metric}`;
    chart.applyOptions({ timeScale: { secondsVisible: (BUCKET_SECONDS[tf] ?? 60) < 60 } });

    if (!data || data.length === 0) {
      // New token/tf with no data yet: clear the previous chart, but DON'T mark
      // this key as loaded — otherwise the first real data arrives as a "reconcile"
      // and the view stays zoomed to the lone live candle instead of fitting.
      if (key !== viewKeyRef.current) {
        series.setData([]);
        volSeriesRef.current?.setData([]);
        lastBarRef.current = null;
        barsRef.current = [];
        barsLenRef.current = 0;
        paintLegend(null);
      }
      return;
    }

    const bars = cleanBars(data).map(scaleBar);
    const last = bars[bars.length - 1];
    if (metric === "mcap") {
      // Compact USD ($1.2M) on the axis; tick size a few orders below the value.
      const minMove = Math.max(1, Math.pow(10, Math.floor(Math.log10(last.close || 1)) - 4));
      series.applyOptions({ priceFormat: { type: "custom", formatter: formatCompactUsd, minMove } as never });
    } else {
      const precision = precisionFor(last.close);
      series.applyOptions({ priceFormat: { type: "price", precision, minMove: Math.pow(10, -precision) } });
    }

    const fresh = key !== viewKeyRef.current;

    // Reconcile guard: if we're already showing a healthy history and this payload
    // collapsed to a fraction of it (a transient backend fallback), keep what we
    // have — the live edge still advances via the stream. Token/timeframe switches
    // change the view key (fresh) and are never guarded; legitimate growth passes.
    if (!fresh && barsLenRef.current >= 30 && bars.length < barsLenRef.current * 0.5) {
      return;
    }

    const range = fresh ? null : chart.timeScale().getVisibleLogicalRange();

    if (kind === "candle") {
      series.setData(bars as never);
    } else {
      const up = bars.length > 1 && last.close >= bars[0].close;
      series.applyOptions({
        lineColor: up ? UP : DOWN,
        topColor: up ? "rgba(34,224,123,0.28)" : "rgba(255,87,101,0.26)",
        bottomColor: up ? "rgba(34,224,123,0.02)" : "rgba(255,87,101,0.02)",
      } as never);
      series.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.close })) as never);
    }

    // Volume histogram, coloured by each bar's direction.
    volSeriesRef.current?.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? VOL_UP : VOL_DOWN,
      })) as never
    );

    if (fresh) {
      chart.timeScale().fitContent();
      viewKeyRef.current = key;
    } else if (range) {
      chart.timeScale().setVisibleLogicalRange(range); // keep the user's zoom/pan
    }
    lastBarRef.current = last;
    barsRef.current = bars;
    barsLenRef.current = bars.length;
    paintLegend(last);
  }, [data, kind, address, tf, metric, scale]);

  const resetZoom = () => chartRef.current?.timeScale().fitContent();

  return (
    <div className="relative h-full w-full">
      {/* OHLC legend (fomo-style), updated direct-to-DOM on crosshair move. */}
      <div
        ref={legendRef}
        className="pointer-events-none absolute left-3 top-2 z-10 text-[11px] font-semibold tnum tracking-tight"
      />
      <div ref={containerRef} className="h-full w-full" />
      <button
        onClick={resetZoom}
        title="Reset zoom"
        className="absolute bottom-2 right-2 z-10 h-7 px-2 rounded-lg bg-surface-2/80 backdrop-blur border border-line text-[11px] font-bold text-muted hover:text-white hover:border-line-2 transition-colors"
      >
        ⤢ Reset
      </button>
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-2/3 w-full mx-2 rounded-lg bg-surface/20 animate-pulse" />
          <span className="absolute text-xs text-faint">
            {isLoading ? "Loading chart…" : "Waiting for price action…"}
          </span>
        </div>
      )}
    </div>
  );
}
