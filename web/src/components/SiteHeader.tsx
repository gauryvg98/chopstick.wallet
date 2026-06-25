"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AuthButton } from "@/components/AuthButton";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-ink/70 border-b border-line/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Logo size={30} />
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted">
          <Link href="/#features" className="hover:text-white transition-colors">
            Features
          </Link>
          <Link href="/#leaderboard" className="hover:text-white transition-colors">
            Chad Board
          </Link>
          <Link href="/discover" className="hover:text-white transition-colors">
            Discover
          </Link>
          <Link href="/trade" className="hover:text-white transition-colors">
            Trade
          </Link>
          <Link href="/portfolio" className="hover:text-white transition-colors">
            Portfolio
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/trade" className="hidden sm:block">
            <span className="text-sm font-semibold text-white hover:text-chad transition-colors px-3">
              Open app
            </span>
          </Link>
          <AuthButton label="Sign in" />
        </div>
      </div>
    </header>
  );
}
