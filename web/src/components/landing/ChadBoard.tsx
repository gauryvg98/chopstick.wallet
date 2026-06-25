"use client";

import { useEffect, useRef, useState } from "react";
import { useTrending } from "@/lib/api/hooks";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { formatCompactUsd } from "@/lib/format";
import { cn } from "@/lib/cn";

const LEADERS = [
  { name: "GiganticChad", handle: "gigachad.sol", pnl: 412.8, vol: 2_400_000 },
  { name: "ansem", handle: "blknoiz06", pnl: 318.4, vol: 1_900_000 },
  { name: "Cupsey", handle: "cupsey", pnl: 244.1, vol: 1_350_000 },
  { name: "Roman 尺", handle: "roman", pnl: 188.9, vol: 980_000 },
  { name: "cented", handle: "cented7", pnl: 142.2, vol: 760_000 },
  { name: "Mr. Frog", handle: "mrfrog", pnl: 96.5, vol: 540_000 },
  { name: "Euris", handle: "eurisxyz", pnl: 61.3, vol: 410_000 },
];

const MEDALS = ["🥇", "🥈", "🥉"];

function avatarGradient(i: number) {
  return [
    "from-amber-400 to-orange-500",
    "from-slate-300 to-slate-500",
    "from-orange-400 to-rose-500",
    "from-sky-400 to-indigo-500",
    "from-violet-500 to-fuchsia-500",
    "from-emerald-400 to-teal-500",
    "from-pink-500 to-rose-500",
  ][i % 7];
}

function Leaderboard() {
  return (
    <div className="rounded-3xl border border-line bg-surface/60 overflow-hidden">
      <div className="flex items-center justify-between px-5 h-12 border-b border-line">
        <span className="font-bold text-white">🏆 The Chad Board</span>
        <span className="text-[11px] text-faint uppercase tracking-wide">7d PnL</span>
      </div>
      <div className="divide-y divide-line/60">
        {LEADERS.map((l, i) => (
          <div key={l.handle} className="flex items-center gap-3 px-5 py-3">
            <span className="w-6 text-center text-sm">
              {i < 3 ? MEDALS[i] : <span className="text-faint tnum">{i + 1}</span>}
            </span>
            <span className={cn("h-9 w-9 rounded-full bg-gradient-to-br shrink-0", avatarGradient(i))} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white truncate">{l.name}</div>
              <div className="text-xs text-muted truncate">@{l.handle}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-up tnum">+{l.pnl.toFixed(1)}%</div>
              <div className="text-xs text-faint tnum">{formatCompactUsd(l.vol)} vol</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface FeedRow {
  id: number;
  trader: string;
  side: "buy" | "sell";
  symbol: string;
  logoURI: string | null;
  usd: number;
}

const FEED_TRADERS = [
  "moonboy.sol", "Pow", "deepfuckingvalue", "Esee", "0xChad", "frogdealer",
  "Zrool 尺", "apex.sol", "wifhat", "degenking",
];

function LiveFeed() {
  const { data } = useTrending();
  const [rows, setRows] = useState<FeedRow[]>([]);
  // Monotonic id across effect re-runs (the effect re-runs when trending data
  // refreshes), so new rows never reuse an existing row's key.
  const idRef = useRef(0);

  useEffect(() => {
    if (!data || data.length === 0) return;
    const tick = () => {
      const r = Math.random();
      const tok = data[Math.floor(r * data.length) % data.length];
      const row: FeedRow = {
        id: idRef.current++,
        trader: FEED_TRADERS[Math.floor(Math.random() * FEED_TRADERS.length)],
        side: Math.random() < 0.62 ? "buy" : "sell",
        symbol: tok.symbol,
        logoURI: tok.logoURI,
        usd: Math.exp(Math.random() * 6) * 20,
      };
      setRows((prev) => [row, ...prev].slice(0, 9));
    };
    // Seed once (not on every data refresh).
    if (idRef.current === 0) for (let i = 0; i < 6; i++) tick();
    const iv = setInterval(tick, 2200);
    return () => clearInterval(iv);
  }, [data]);

  return (
    <div className="rounded-3xl border border-line bg-surface/60 overflow-hidden">
      <div className="flex items-center justify-between px-5 h-12 border-b border-line">
        <span className="font-bold text-white flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-chad animate-pulse" /> Live feed
        </span>
        <span className="text-[11px] text-faint uppercase tracking-wide">following</span>
      </div>
      <div className="divide-y divide-line/60">
        {rows.map((row, i) => (
          <div
            key={row.id}
            className={cn(
              "flex items-center gap-3 px-5 py-3 text-sm",
              i === 0 && "animate-[pulse_0.6s_ease-out_1]"
            )}
          >
            <TokenAvatar symbol={row.symbol} logoURI={row.logoURI} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate">
                <span className="font-semibold text-white">{row.trader}</span>{" "}
                <span className={row.side === "buy" ? "text-up" : "text-down"}>
                  {row.side === "buy" ? "bought" : "sold"}
                </span>{" "}
                <span className="text-muted">{row.symbol}</span>
              </div>
            </div>
            <span className="tnum font-semibold text-white">
              {formatCompactUsd(row.usd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChadBoard() {
  return (
    <section id="leaderboard" className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
      <div className="text-center max-w-2xl mx-auto">
        <span className="text-sm font-bold uppercase tracking-widest text-chad">
          become a legend
        </span>
        <h2 className="mt-3 font-display font-bold text-4xl sm:text-5xl tracking-tight lowercase">
          climb the board. flex the gains.
        </h2>
        <p className="mt-4 text-lg text-muted">
          Follow the best, see every move in real time, and make your name on ChadWallet.
        </p>
      </div>

      <div className="mt-12 grid lg:grid-cols-2 gap-5">
        <Leaderboard />
        <LiveFeed />
      </div>
    </section>
  );
}
