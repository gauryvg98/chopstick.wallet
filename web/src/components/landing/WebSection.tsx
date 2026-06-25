"use client";

import { useTrending } from "@/lib/api/hooks";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { PriceText } from "@/components/ui/PriceText";
import { ChangeText } from "@/components/ui/ChangeText";
import { Sparkline } from "@/components/ui/Sparkline";
import { formatCompactUsd } from "@/lib/format";

/** A browser-framed mini render of our real /trade workspace. */
function TradeMockup() {
  const { data } = useTrending();
  const tokens = (data ?? []).slice(0, 6);
  const active = tokens[1];

  return (
    <div className="rounded-2xl overflow-hidden border border-line-2 bg-ink shadow-2xl">
      {/* browser chrome */}
      <div className="h-9 flex items-center gap-2 px-4 bg-surface-2 border-b border-line">
        <span className="h-3 w-3 rounded-full bg-down/80" />
        <span className="h-3 w-3 rounded-full bg-amber-400/80" />
        <span className="h-3 w-3 rounded-full bg-chad/80" />
        <div className="ml-3 h-5 flex-1 max-w-xs rounded-md bg-ink/60 border border-line text-[10px] text-faint flex items-center px-2">
          chadwallet.xyz/trade
        </div>
      </div>

      {/* 3-column workspace */}
      <div className="grid grid-cols-[1fr_1.4fr_1fr] h-[300px] text-xs">
        {/* left: trending */}
        <div className="border-r border-line p-2 space-y-1 overflow-hidden">
          <div className="text-[10px] font-bold text-chad px-1 pb-1">📈 Trending</div>
          {tokens.map((t) => (
            <div key={t.address} className="flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg hover:bg-white/5">
              <TokenAvatar symbol={t.symbol} logoURI={t.logoURI} size={18} />
              <span className="font-semibold text-white truncate flex-1">{t.symbol}</span>
              <ChangeText value={t.change24h} className="text-[10px]" showArrow={false} />
            </div>
          ))}
        </div>

        {/* middle: chart */}
        <div className="border-r border-line p-3 flex flex-col">
          {active && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TokenAvatar symbol={active.symbol} logoURI={active.logoURI} size={24} />
                  <span className="font-bold text-white">{active.symbol}</span>
                </div>
                <span className="font-bold text-white">{formatCompactUsd(active.marketCap)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <PriceText value={active.priceUsd} className="text-white" />
                <ChangeText value={active.change24h} className="text-[10px]" />
              </div>
              <div className="mt-auto">
                <Sparkline data={active.sparkline} width={260} height={120} />
              </div>
            </>
          )}
        </div>

        {/* right: buy/sell */}
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-surface-2">
            <div className="h-6 rounded-md bg-chad text-ink text-[10px] font-bold flex items-center justify-center">BUY</div>
            <div className="h-6 rounded-md text-muted text-[10px] font-bold flex items-center justify-center">SELL</div>
          </div>
          <div className="h-9 rounded-lg bg-surface-2 border border-line flex items-center px-2 text-muted">$ 100.00</div>
          <div className="grid grid-cols-4 gap-1">
            {["$10", "$50", "$100", "$500"].map((p) => (
              <div key={p} className="h-5 rounded bg-surface-2 border border-line text-[9px] text-muted flex items-center justify-center">{p}</div>
            ))}
          </div>
          <div className="h-9 rounded-lg bg-chad text-ink font-bold text-[11px] flex items-center justify-center">
            Buy {active?.symbol}
          </div>
          <div className="rounded-lg bg-surface/60 border border-line p-2 mt-2">
            <div className="text-[10px] font-bold text-white mb-1">Your position</div>
            <div className="flex justify-between text-[10px] text-muted"><span>PnL</span><span className="text-up font-semibold">+$1.82k (24.1%)</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WebSection() {
  return (
    <section className="bg-app-glow border-y border-line">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-sm font-bold uppercase tracking-widest text-chad">
              Now available on web
            </span>
            <h2 className="mt-3 font-display font-bold text-4xl sm:text-5xl tracking-tight lowercase">
              trade from anywhere.
              <br />
              never lose a beat.
            </h2>
            <p className="mt-4 text-lg text-muted max-w-md">
              Open a trade on your phone, close it on your desktop — same wallet,
              same positions, all in one app.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Real-time charts", "1-tap swaps", "Live trades", "Whale alerts"].map((tag) => (
                <span key={tag} className="rounded-full border border-line-2 bg-surface/60 px-3 py-1.5 text-xs font-semibold text-muted">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <TradeMockup />
        </div>
      </div>
    </section>
  );
}
