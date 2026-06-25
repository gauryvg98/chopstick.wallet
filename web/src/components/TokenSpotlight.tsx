"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { ChangeText } from "@/components/ui/ChangeText";
import { PriceText } from "@/components/ui/PriceText";
import { useToken } from "@/lib/api/hooks";
import { useLivePrice } from "@/lib/livePrices";
import { formatCompactUsd, shortAddr } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Minimal token shape needed to open the spotlight — all we have from a list. */
export interface SpotlightToken {
  address: string;
  symbol: string;
  name: string;
  logoURI: string | null;
  priceUsd: number;
  marketCap: number;
  change24h: number;
}

interface SpotlightCtx {
  open: (t: SpotlightToken) => void;
}

const Ctx = createContext<SpotlightCtx | null>(null);

/** Click any token avatar to pop a live spotlight (price · market cap · address). */
export function useSpotlight(): SpotlightCtx {
  return useContext(Ctx) ?? { open: () => {} };
}

export function SpotlightProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<SpotlightToken | null>(null);
  const open = useCallback((t: SpotlightToken) => setToken(t), []);
  const close = useCallback(() => setToken(null), []);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {token && <SpotlightModal token={token} onClose={close} />}
    </Ctx.Provider>
  );
}

function SpotlightModal({
  token,
  onClose,
}: {
  token: SpotlightToken;
  onClose: () => void;
}) {
  const { data: detail } = useToken(token.address);
  const { price: livePrice, dir } = useLivePrice(token.address);
  const [copied, setCopied] = useState(false);
  const [broken, setBroken] = useState(false);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const price = livePrice && livePrice > 0 ? livePrice : token.priceUsd;
  const supply = detail?.totalSupply ?? 0;
  // Live market cap follows the streamed price once we know real supply.
  const marketCap = price > 0 && supply > 0 ? price * supply : token.marketCap;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl border border-line bg-surface shadow-2xl shadow-black/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* image — shown at the picture's natural aspect ratio, with a blurred
            fill of itself behind so any letterbox gaps look intentional */}
        <div className="relative overflow-hidden bg-ink-2 flex items-center justify-center min-h-[180px]">
          {token.logoURI && !broken && (
            <div
              aria-hidden
              className="absolute inset-0 bg-cover bg-center opacity-50 blur-2xl scale-125"
              style={{ backgroundImage: `url(${token.logoURI})` }}
            />
          )}
          <div className="absolute inset-0 bg-app-glow opacity-60" aria-hidden />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 h-8 w-8 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white transition-colors grid place-items-center backdrop-blur-sm z-10"
          >
            ✕
          </button>
          {token.logoURI && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={token.logoURI}
              alt={token.symbol}
              referrerPolicy="no-referrer"
              onError={() => setBroken(true)}
              className="relative z-[1] block max-h-[340px] w-auto max-w-full object-contain"
            />
          ) : (
            <div className="relative z-[1] py-10">
              <TokenAvatar symbol={token.symbol} logoURI={null} size={120} />
            </div>
          )}
        </div>

        {/* name + live price */}
        <div className="px-6 pt-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display font-bold text-2xl text-white truncate">
                {token.symbol}
              </div>
              <div className="text-sm text-muted truncate">{token.name}</div>
            </div>
            <ChangeText value={token.change24h} className="text-base shrink-0" />
          </div>
          <PriceText
            value={price}
            className={cn(
              "mt-2 block font-display font-bold text-3xl text-white",
              dir === "up" && "flash-up",
              dir === "down" && "flash-down"
            )}
          />
        </div>

        {/* stats */}
        <div className="grid grid-cols-2 gap-px bg-line">
          <Stat label="Market cap" value={formatCompactUsd(marketCap)} />
          <Stat
            label="24h volume"
            value={formatCompactUsd(detail?.volume24h ?? 0)}
          />
        </div>

        {/* address */}
        <div className="px-6 py-4">
          <div className="text-xs uppercase tracking-wide text-faint">
            Mint address
          </div>
          <button
            onClick={copy}
            className="mt-1.5 w-full flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 hover:border-chad/40 transition-colors group"
          >
            <span className="font-mono text-sm text-white truncate">
              {shortAddr(token.address, 6, 6)}
            </span>
            <span
              className={cn(
                "text-xs font-semibold shrink-0",
                copied ? "text-up" : "text-muted group-hover:text-chad"
              )}
            >
              {copied ? "Copied ✓" : "Copy"}
            </span>
          </button>

          <Link
            href={`/trade/${token.address}`}
            onClick={onClose}
            className="mt-3 block w-full text-center rounded-xl bg-chad text-ink font-bold h-11 leading-[44px] hover:brightness-105 transition"
          >
            Open full chart →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-6 py-3">
      <div className="text-xs uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-0.5 font-semibold text-white tnum">{value}</div>
    </div>
  );
}
