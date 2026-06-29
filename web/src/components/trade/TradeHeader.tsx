"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AuthButton } from "@/components/AuthButton";
import { TokenSearch } from "./TokenSearch";
import { IS_LIVE } from "@/lib/api";
import { useSidebar } from "@/lib/tradeSidebar";

export function TradeHeader() {
  const { toggleMobile } = useSidebar();
  return (
    <header className="h-14 shrink-0 border-b border-line bg-ink-2 flex items-center gap-3 sm:gap-4 px-3 sm:px-4">
      {/* Mobile: open the token-list drawer (the desktop sidebar). */}
      <button
        onClick={toggleMobile}
        aria-label="Open token list"
        className="lg:hidden grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <Logo size={26} withWordmark={false} />
      <Link
        href="/"
        className="hidden sm:block font-display font-bold text-white text-lg tracking-tight"
      >
        ChadWallet
      </Link>
      <span
        className={`hidden md:inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
          IS_LIVE
            ? "text-chad border-chad/40 bg-chad/10"
            : "text-amber-300 border-amber-300/30 bg-amber-300/10"
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
        {IS_LIVE ? "Live data" : "Demo data"}
      </span>

      <div className="flex-1 flex justify-center px-2">
        <TokenSearch />
      </div>

      <AuthButton size="sm" label="Sign in" />
    </header>
  );
}
