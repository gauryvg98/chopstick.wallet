"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AuthButton } from "@/components/AuthButton";

const LINKS: [string, string][] = [
  ["/#features", "Features"],
  ["/#leaderboard", "Solis Board"],
  ["/discover", "Discover"],
  ["/trade", "Trade"],
  ["/portfolio", "Portfolio"],
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-ink/70 border-b border-line/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Logo size={30} />
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="hover:text-white transition-colors">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/trade" className="hidden sm:block">
            <span className="text-sm font-semibold text-white hover:text-solis transition-colors px-3">
              Open app
            </span>
          </Link>
          <AuthButton label="Sign in" />
          {/* mobile menu toggle */}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="md:hidden grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface-2 text-white"
          >
            <span className="text-lg leading-none">{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      {/* mobile dropdown nav */}
      {open && (
        <nav className="md:hidden border-t border-line/60 bg-ink/95 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-4 py-2 flex flex-col">
            {LINKS.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="py-3 text-sm font-semibold text-muted hover:text-white border-b border-line/40 last:border-0"
              >
                {label}
              </Link>
            ))}
            <Link
              href="/trade"
              onClick={() => setOpen(false)}
              className="mt-3 mb-2 rounded-xl bg-solis py-3 text-center text-sm font-bold text-ink"
            >
              Open app
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
