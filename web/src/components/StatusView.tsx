"use client";

import useSWR from "swr";
import { SiteHeader } from "@/components/SiteHeader";
import { cn } from "@/lib/cn";

const API = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");

interface StatusMetric {
  name: string;
  label: string;
  count: number;
  errors: number;
  lastMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  recent: number[];
}
interface StatusData {
  metrics: StatusMetric[];
  uptimeSec: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Band = "good" | "ok" | "slow";
function band(ms: number): Band {
  if (ms < 400) return "good";
  if (ms < 1500) return "ok";
  return "slow";
}
const textColor: Record<Band, string> = {
  good: "text-up",
  ok: "text-amber-400",
  slow: "text-down",
};
const dotColor: Record<Band, string> = {
  good: "bg-up",
  ok: "bg-amber-400",
  slow: "bg-down",
};

function fmtMs(ms: number) {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + "s";
  return Math.round(ms) + "ms";
}
function fmtUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(s % 60)}s`;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return <div className="h-10" />;
  const max = Math.max(...data, 1);
  const w = 100;
  const h = 36;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("w-full h-10", color)}
    >
      <polygon
        points={`0,${h} ${pts} ${w},${h}`}
        fill="currentColor"
        opacity={0.12}
      />
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Mini({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-1 text-center">
      <div className="text-faint">{label}</div>
      <div className="text-white font-semibold tnum">{v}</div>
    </div>
  );
}

function MetricCard({ m }: { m: StatusMetric }) {
  const has = m.count > 0;
  const b = band(m.p50Ms || m.lastMs);
  const errRate = m.count > 0 ? (m.errors / m.count) * 100 : 0;
  return (
    <div className="rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{m.label}</span>
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            has ? dotColor[b] : "bg-white/20",
            has && b !== "slow" && "animate-pulse"
          )}
        />
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span
          className={cn(
            "font-display font-bold text-3xl tnum",
            has ? textColor[b] : "text-faint"
          )}
        >
          {has ? fmtMs(m.p50Ms) : "—"}
        </span>
        <span className="text-xs text-faint pb-1.5">p50</span>
      </div>
      <div className="mt-1">
        <Sparkline data={m.recent} color={has ? textColor[b] : "text-faint"} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
        <Mini label="avg" v={has ? fmtMs(m.avgMs) : "—"} />
        <Mini label="p95" v={has ? fmtMs(m.p95Ms) : "—"} />
        <Mini label="max" v={has ? fmtMs(m.maxMs) : "—"} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-faint">
        <span className="tnum">{m.count.toLocaleString()} samples</span>
        <span className={errRate > 0 ? "text-down font-semibold" : ""}>
          {errRate > 0 ? `${errRate.toFixed(1)}% errors` : "0 errors"}
        </span>
      </div>
    </div>
  );
}

export function StatusView() {
  const { data, error } = useSWR<StatusData>(
    API ? `${API}/api/status` : null,
    fetcher,
    { refreshInterval: 2000, revalidateOnFocus: false }
  );
  const metrics = data?.metrics ?? [];

  return (
    <div className="flex flex-col min-h-full">
      <SiteHeader />
      <main className="flex-1 bg-app-glow">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display font-bold text-4xl sm:text-5xl tracking-tight lowercase">
                system status
              </h1>
              <p className="mt-2 text-muted">
                Live latency across the data pipeline — sampled in real time,
                refreshed every 2s.
              </p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-solis">
                <span className="h-2 w-2 rounded-full bg-solis animate-pulse" />
                Live
              </span>
              {data && (
                <div className="text-xs text-faint mt-1 tnum">
                  uptime {fmtUptime(data.uptimeSec)}
                </div>
              )}
            </div>
          </div>

          {error ? (
            <div className="mt-10 rounded-2xl border border-down/40 bg-down/10 p-6 text-center text-down">
              Status unavailable — the backend isn&apos;t reachable.
            </div>
          ) : metrics.length === 0 ? (
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-44 rounded-2xl bg-surface/40 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {metrics.map((m) => (
                <MetricCard key={m.name} m={m} />
              ))}
            </div>
          )}

          <p className="mt-6 text-center text-xs text-faint">
            Green &lt; 400ms · amber &lt; 1.5s · red ≥ 1.5s. All times are server-side
            round-trips to the free data sources (GeckoTerminal · Jupiter · Helius).
          </p>
        </div>
      </main>
    </div>
  );
}
