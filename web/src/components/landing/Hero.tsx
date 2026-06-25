"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { StoreButtons } from "@/components/StoreButtons";
import { useBanner } from "@/lib/api/hooks";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { PriceText } from "@/components/ui/PriceText";
import { ChangeText } from "@/components/ui/ChangeText";

function FloatingCard({
  className,
  tokenIndex,
}: {
  className?: string;
  tokenIndex: number;
}) {
  const { data } = useBanner();
  const t = data?.[tokenIndex];
  if (!t) return null;
  return (
    <div
      className={`absolute z-30 flex items-center gap-2.5 rounded-2xl bg-ink/90 backdrop-blur border border-white/10 px-3.5 py-2.5 shadow-xl ${className}`}
    >
      <TokenAvatar symbol={t.symbol} logoURI={t.logoURI} size={30} />
      <div className="leading-tight">
        <div className="text-sm font-bold text-white">{t.symbol}</div>
        <PriceText value={t.priceUsd} className="text-xs text-muted" />
      </div>
      <ChangeText value={t.change24h} className="text-xs ml-1" />
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-chad-gradient">
      {/* soft light blooms */}
      <div className="pointer-events-none absolute -top-24 right-1/4 h-96 w-96 rounded-full bg-white/30 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 rounded-full bg-chad/30 blur-[120px]" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28 grid md:grid-cols-2 gap-10 items-center">
        {/* Left */}
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-ink/10 border border-ink/15 px-3 py-1.5 text-xs font-bold text-ink">
            <span className="h-2 w-2 rounded-full bg-ink animate-pulse" />
            #1 meme coin trading app on Solana
          </span>

          <h1 className="mt-5 font-display font-bold tracking-tight text-ink text-5xl sm:text-6xl lg:text-7xl leading-[0.92] lowercase">
            where degens
            <br />
            become chads.
          </h1>

          <p className="mt-5 text-lg sm:text-xl text-ink/70 max-w-md font-medium">
            From memecoins to viral tokens, trade any Solana coin in seconds.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/trade">
              <Button size="lg" variant="dark" className="bg-ink text-white hover:bg-ink/90">
                Start trading
              </Button>
            </Link>
          </div>

          <div className="mt-6">
            <StoreButtons />
          </div>
        </div>

        {/* Right — the Chad (this brand's mascot, like fomo's astronaut) */}
        <div className="relative flex justify-center md:justify-end">
          <div className="pointer-events-none absolute inset-0 m-auto h-72 w-72 rounded-full bg-white/40 blur-2xl" />
          <div className="relative">
            <Image
              src="/brand/logo-light.png"
              alt="ChadWallet"
              width={420}
              height={420}
              priority
              className="relative drop-shadow-2xl w-[260px] sm:w-[360px] lg:w-[420px] h-auto"
            />
            <FloatingCard tokenIndex={3} className="-left-6 top-10 hidden sm:flex" />
            <FloatingCard tokenIndex={1} className="-right-2 bottom-10 hidden sm:flex" />
          </div>
        </div>
      </div>
    </section>
  );
}
