"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { HoldingsPanel } from "@/components/trade/HoldingsPanel";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/cn";

export function AuthButton({
  size = "md",
  variant = "primary",
  label = "Sign in",
  fullWidth = false,
}: {
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "white" | "dark";
  label?: string;
  fullWidth?: boolean;
}) {
  const { ready, authenticated, user, login, logout, isDemo } = useAuth();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const copyAddr = (a: string) => {
    navigator.clipboard?.writeText(a).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!ready) {
    return (
      <div className="h-11 w-28 rounded-full bg-surface-2 animate-pulse" />
    );
  }

  if (!authenticated) {
    return (
      <Button
        size={size}
        variant={variant}
        onClick={login}
        className={cn(fullWidth && "w-full")}
      >
        {label}
      </Button>
    );
  }

  const addr = user?.address;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-2 h-11 pl-2 pr-3 rounded-full bg-surface-2 border border-line-2 hover:border-white/30 transition-colors",
          fullWidth && "w-full justify-center"
        )}
      >
        <span className="h-7 w-7 rounded-full bg-gradient-to-br from-chad to-teal shrink-0" />
        <span className="text-sm font-semibold tnum text-white">
          {addr ? shortAddr(addr, 4, 4) : "Wallet"}
        </span>
        {isDemo && (
          <span className="text-[10px] uppercase tracking-wide font-bold text-ink bg-chad rounded px-1 py-0.5">
            Demo
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-surface border border-line-2 shadow-2xl p-3 z-50">
          <div className="px-2 py-1.5">
            <div className="text-xs text-muted">Signed in</div>
            <div className="text-sm font-medium text-white truncate">
              {user?.email ?? "Solana wallet"}
            </div>
            {/* Clickable wallet address → opens Solscan in a new tab. */}
            {addr && (
              <div className="mt-1 flex items-center gap-2">
                {isDemo ? (
                  <span className="font-mono text-xs text-faint">
                    {shortAddr(addr, 5, 5)}
                  </span>
                ) : (
                  <a
                    href={`https://solscan.io/account/${addr}`}
                    target="_blank"
                    rel="noreferrer"
                    title="View wallet on Solscan"
                    className="font-mono text-xs text-muted hover:text-chad transition-colors inline-flex items-center gap-1"
                  >
                    {shortAddr(addr, 5, 5)} ↗
                  </a>
                )}
                <button
                  onClick={() => copyAddr(addr)}
                  className="text-[10px] font-semibold text-faint hover:text-white"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
            )}
          </div>
          {/* Live wallet: SOL + every token with USD values, ticking over the
              websocket — visible on every screen since this menu lives in the
              global header. Demo mode has no real chain wallet. */}
          {!isDemo && (
            <div className="rounded-xl bg-ink-2 border border-line my-1 overflow-hidden max-h-72 overflow-y-auto scroll-thin">
              <HoldingsPanel flat />
            </div>
          )}
          {!isDemo && (
            <Link
              href="/portfolio"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-semibold text-chad hover:underline py-1.5"
            >
              View full portfolio →
            </Link>
          )}
          {isDemo && (
            <p className="text-[11px] text-faint px-2 py-1">
              Demo mode — set a Privy App ID for real Apple/Google login.
            </p>
          )}
          <button
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="w-full text-left text-sm font-medium text-down hover:bg-white/5 rounded-lg px-2 py-2 mt-1"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
