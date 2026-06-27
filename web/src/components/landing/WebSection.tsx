"use client";

import { ChangeText } from "@/components/ui/ChangeText";

/* ---- mocked data so the desktop mockup is always populated, mirroring the
       real /trade workspace (trending list · token+chart+trades · buy/sell) ---- */
const TOKENS = [
  { img: "bonk", sym: "BONK", mc: "$1.7B", chg: 12.4 },
  { img: "wif", sym: "WIF", mc: "$1.2B", chg: 5.2 },
  { img: "jup", sym: "JUP", mc: "$1.3B", chg: 8.3 },
  { img: "popcat", sym: "POPCAT", mc: "$890M", chg: -3.1 },
  { img: "pengu", sym: "PENGU", mc: "$640M", chg: 24.7 },
  { img: "wen", sym: "WEN", mc: "$210M", chg: -1.4 },
];
const TRADES = [
  { side: "BUY", who: "XxiC…s9w7", usd: "$331", t: "2s" },
  { side: "BUY", who: "wU4d…oSRQ", usd: "$126", t: "9s" },
  { side: "SELL", who: "eJEn…WrZg", usd: "$566", t: "23s" },
];

function TokenImg({ img, size = "h-[18px] w-[18px]" }: { img: string; size?: string }) {
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-full bg-ink`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/tokens/${img}.png`} alt="" className="h-full w-full object-cover" />
    </div>
  );
}

/** A detailed mini candlestick chart (candles + wicks + volume + grid + axis). */
function MiniChart() {
  const deltas = [3, -1, 2, 4, -2, 3, 1, -3, 4, 2, 5, -2, 3, 6, -1, 2, 4, -3, 5, 2, 4, 7, -2, 3, 5];
  const vols = [4, 3, 5, 6, 7, 4, 3, 8, 5, 4, 6, 7, 4, 9, 5, 4, 6, 8, 5, 4, 7, 9, 6, 5, 8];
  let p = 24;
  const candles = deltas.map((d, i) => {
    const o = p;
    const c = Math.max(3, p + d);
    p = c;
    return { o, c, h: Math.max(o, c) + 1.6, l: Math.min(o, c) - 1.6, v: vols[i] };
  });
  const min = Math.min(...candles.map((k) => k.l));
  const max = Math.max(...candles.map((k) => k.h));
  const maxV = Math.max(...candles.map((k) => k.v));
  const PW = 292, top = 6, bot = 90, vTop = 98, vBot = 122;
  const y = (val: number) => top + ((max - val) / (max - min)) * (bot - top);
  const step = PW / candles.length;
  const bw = step * 0.6;
  const last = candles[candles.length - 1];
  return (
    <svg viewBox="0 0 320 126" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1="0" x2={PW} y1={top + t * (bot - top)} y2={top + t * (bot - top)} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
      ))}
      {candles.map((k, i) => {
        const cx = i * step + step / 2;
        const col = k.c >= k.o ? "#22e07b" : "#ff5247";
        const vh = (k.v / maxV) * (vBot - vTop);
        const bodyY = Math.min(y(k.o), y(k.c));
        const bodyH = Math.max(0.8, Math.abs(y(k.c) - y(k.o)));
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={vBot - vh} width={bw} height={vh} fill={col} opacity="0.22" />
            <line x1={cx} x2={cx} y1={y(k.h)} y2={y(k.l)} stroke={col} strokeWidth="0.7" />
            <rect x={cx - bw / 2} y={bodyY} width={bw} height={bodyH} fill={col} />
          </g>
        );
      })}
      {/* current-price line + tag */}
      <line x1="0" x2={PW} y1={y(last.c)} y2={y(last.c)} stroke="#22e07b" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.7" />
      <rect x={PW} y={y(last.c) - 5} width="28" height="10" rx="2" fill="#22e07b" />
      <text x={PW + 14} y={y(last.c) + 2.6} fill="#0a0b0d" fontSize="6.5" fontWeight="700" textAnchor="middle">$640M</text>
      {/* right-axis labels */}
      {[["$720M", max], ["$520M", (max + min) / 2], ["$340M", min]].map(([lbl, val], i) => (
        <text key={i} x={PW + 3} y={y(val as number) + (i === 0 ? 6 : i === 2 ? -2 : 2)} fill="rgba(255,255,255,0.38)" fontSize="6">{lbl as string}</text>
      ))}
    </svg>
  );
}

/** A browser-framed mini render of the real /trade workspace, on mocked data. */
function TradeMockup() {
  const active = TOKENS[4]; // PENGU
  return (
    <div className="overflow-hidden rounded-2xl border border-line-2 bg-ink text-left shadow-2xl">
      {/* browser chrome */}
      <div className="flex h-9 items-center gap-2 border-b border-line bg-surface-2 px-4">
        <span className="h-3 w-3 rounded-full bg-down/80" />
        <span className="h-3 w-3 rounded-full bg-amber-400/80" />
        <span className="h-3 w-3 rounded-full bg-chad/80" />
        <div className="ml-3 flex h-5 max-w-xs flex-1 items-center rounded-md border border-line bg-ink/60 px-2 text-[10px] text-faint">
          chadwallet.xyz/trade
        </div>
      </div>

      {/* 3-column workspace */}
      <div className="grid h-[340px] grid-cols-[1fr_1.5fr_1fr] text-xs">
        {/* left: trending */}
        <div className="space-y-0.5 overflow-hidden border-r border-line p-2">
          <div className="px-1 pb-1 text-[10px] font-bold text-chad">🔥 Trending</div>
          {TOKENS.map((t, i) => (
            <div key={t.sym} className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 ${i === 4 ? "bg-surface-2 ring-1 ring-line-2" : ""}`}>
              <span className="w-3 tnum text-[9px] text-faint">{i + 1}</span>
              <TokenImg img={t.img} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate font-semibold text-white">{t.sym}</div>
                <div className="text-[9px] text-faint">{t.mc}</div>
              </div>
              <ChangeText value={t.chg} className="text-[10px]" showArrow={false} />
            </div>
          ))}
        </div>

        {/* middle: token + chart + trades */}
        <div className="flex flex-col border-r border-line p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TokenImg img={active.img} size="h-6 w-6" />
              <div className="leading-tight">
                <div className="font-bold text-white">{active.sym}</div>
                <div className="text-[9px] text-faint">Pudgy Penguins</div>
              </div>
            </div>
            <div className="text-right leading-tight">
              <div className="font-bold text-white">{active.mc}</div>
              <ChangeText value={active.chg} className="text-[10px]" />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1 text-[8px]">
            {[["LIQ", "$4.2M"], ["VOL", "$88M"], ["HOLDERS", "41K"], ["TOP 10", "18%"]].map(([l, v]) => (
              <div key={l} className="rounded border border-line bg-surface/50 px-1 py-1">
                <div className="text-faint">{l}</div>
                <div className="tnum font-semibold text-white">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 min-h-0 flex-1">
            <MiniChart />
          </div>
          <div className="mt-1 space-y-0.5">
            {TRADES.map((tr, i) => (
              <div key={i} className="flex items-center gap-2 text-[9px]">
                <span className={`w-6 font-bold ${tr.side === "BUY" ? "text-up" : "text-down"}`}>{tr.side}</span>
                <span className="flex-1 truncate text-faint">{tr.who}</span>
                <span className="tnum text-white">{tr.usd}</span>
                <span className="w-6 text-right tnum text-faint">{tr.t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* right: buy/sell */}
        <div className="space-y-2 p-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
            <div className="flex h-6 items-center justify-center rounded-md bg-chad text-[10px] font-bold text-ink">BUY</div>
            <div className="flex h-6 items-center justify-center rounded-md text-[10px] font-bold text-muted">SELL</div>
          </div>
          <div className="flex h-9 items-center rounded-lg border border-line bg-surface-2 px-2 font-semibold text-white">$100.00</div>
          <div className="grid grid-cols-4 gap-1">
            {["$10", "$50", "$100", "$500"].map((p) => (
              <div key={p} className="flex h-5 items-center justify-center rounded border border-line bg-surface-2 text-[9px] text-muted">{p}</div>
            ))}
          </div>
          <div className="flex h-9 items-center justify-center rounded-lg bg-chad text-[11px] font-bold text-ink">Buy {active.sym}</div>
          <div className="mt-2 rounded-lg border border-line bg-surface/60 p-2">
            <div className="mb-1 text-[10px] font-bold text-white">Your position</div>
            <div className="flex justify-between text-[10px] text-muted"><span>PnL</span><span className="font-semibold text-up">+$1.82k (24.1%)</span></div>
          </div>
          <div className="flex justify-between rounded-lg border border-line bg-surface/60 p-2 text-[10px]">
            <span className="text-faint">Your wallet</span><span className="font-bold text-white">$27.79</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A crisp CSS render of the app's wallet screen (no image cropping) for the phone. */
function PhoneScreen() {
  const acts: [string, string][] = [["↑", "Send"], ["↓", "Receive"], ["+", "Deposit"], ["↗", "Withdraw"]];
  const holds: [string, string, string, string][] = [
    ["bonk", "BONK", "36.2K", "$5.12"],
    ["jup", "JUP", "410", "$91.30"],
    ["wif", "WIF", "182", "$31.40"],
  ];
  const nav: [string, string, boolean][] = [["⌂", "Home", false], ["✦", "Memes", false], ["◎", "Discover", false], ["▣", "Account", true]];
  return (
    <div className="flex h-full w-full flex-col bg-[#0b0d10] text-white">
      <div className="h-7 shrink-0" />
      <div className="px-3">
        <div className="flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-[8px] text-faint">
          🔍 Search tokens, wallets…
        </div>
      </div>
      <div className="px-3.5 pt-3">
        <div className="text-[22px] font-bold leading-none tnum">$773.98</div>
        <div className="mt-1 text-[9px] font-semibold text-up">▲ $112.40 (16.9%) today</div>
      </div>
      <div className="px-2 pt-1">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-[56px] w-full">
          <polyline points="0,34 8,31 16,34 24,28 32,31 40,24 48,27 56,19 64,23 72,14 80,17 88,8 100,4" fill="none" stroke="#22e07b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="grid grid-cols-4 gap-1 px-2 pt-2">
        {acts.map(([ic, l]) => (
          <div key={l} className="flex flex-col items-center gap-1">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-chad text-sm font-bold text-ink">{ic}</div>
            <span className="text-[7px] text-muted">{l}</span>
          </div>
        ))}
      </div>
      <div className="flex-1 px-3 pt-3">
        <div className="text-[10px] font-bold">Holdings</div>
        <div className="mt-1.5 space-y-1.5">
          {holds.map(([img, sym, amt, val]) => (
            <div key={sym} className="flex items-center gap-2">
              <div className="h-6 w-6 overflow-hidden rounded-full bg-ink">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/brand/tokens/${img}.png`} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-[9px] font-semibold">{sym}</div>
                <div className="text-[7px] text-faint">{amt}</div>
              </div>
              <div className="tnum text-[9px] font-semibold">{val}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 border-t border-line py-2">
        {nav.map(([ic, l, act]) => (
          <div key={l} className={`flex flex-col items-center gap-0.5 ${act ? "text-chad" : "text-faint"}`}>
            <span className="text-[10px]">{ic}</span>
            <span className="text-[6px]">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WebSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-24 sm:py-32 text-center">
        <span className="text-sm font-bold uppercase tracking-widest text-chad">
          Now available on web
        </span>
        <h2 className="mt-3 font-display font-bold text-4xl sm:text-6xl tracking-tight lowercase">
          trade from anywhere.
          <br />
          never lose a beat.
        </h2>
        <p className="mt-4 mx-auto max-w-xl text-lg text-muted">
          Open a trade on your phone, close it on your desktop — same wallet,
          same positions, all in one app.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {["Real-time charts", "1-tap swaps", "Live trades", "Whale alerts"].map((tag) => (
            <span key={tag} className="rounded-full border border-line-2 bg-surface/60 px-3 py-1.5 text-xs font-semibold text-muted">
              {tag}
            </span>
          ))}
        </div>

        {/* Desktop mockup + overlapping 3D iPhone (slow float) — fomo's composition */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <TradeMockup />

          {/* sits beyond the desktop's bottom-right corner so it doesn't cover the
              buy panel — reads as a separate device, not a cut-off overlay */}
          <div className="absolute -bottom-16 right-2 hidden sm:block sm:right-4 lg:right-8 [perspective:1300px]">
            <div className="animate-[float_8s_ease-in-out_infinite]">
              <div className="relative [transform-style:preserve-3d] [transform:rotateY(-20deg)_rotateX(6deg)]">
                {/* contact shadow */}
                <div className="pointer-events-none absolute -bottom-5 left-1/2 h-7 w-[72%] -translate-x-1/2 rounded-[50%] bg-black/70 blur-xl" />
                {/* phone body — titanium-style bezel */}
                <div className="relative aspect-[9/19.5] w-[150px] rounded-[2.4rem] bg-gradient-to-br from-zinc-500 via-zinc-800 to-black p-[5px] shadow-[0_45px_90px_-25px_rgba(0,0,0,0.9)] lg:w-[178px]">
                  <div className="relative h-full w-full overflow-hidden rounded-[2.05rem]">
                    <PhoneScreen />
                    {/* screen gloss */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/15 via-transparent to-transparent" />
                  </div>
                  {/* dynamic island */}
                  <div className="absolute left-1/2 top-[10px] z-10 h-[14px] w-[42px] -translate-x-1/2 rounded-full bg-black" />
                  {/* metal rim highlight */}
                  <div className="pointer-events-none absolute inset-0 rounded-[2.4rem] ring-1 ring-white/25" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
