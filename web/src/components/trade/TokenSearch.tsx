"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBanner } from "@/lib/api/hooks";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { ChangeText } from "@/components/ui/ChangeText";

/** Token search box — filters the token list and routes on select. */
export function TokenSearch() {
  const { data } = useBanner();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const results = useMemo(() => {
    const list = data ?? [];
    if (!q.trim()) return list.slice(0, 6);
    const needle = q.toLowerCase();
    return list
      .filter(
        (t) =>
          t.symbol.toLowerCase().includes(needle) ||
          t.name.toLowerCase().includes(needle)
      )
      .slice(0, 8);
  }, [data, q]);

  return (
    <div className="relative w-full max-w-md" ref={ref}>
      <div className="flex items-center gap-2 h-10 px-3.5 rounded-full bg-surface-2 border border-line focus-within:border-line-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-faint">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search tokens, wallets…"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-faint outline-none"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-surface border border-line-2 shadow-2xl p-1.5 z-50 max-h-80 overflow-y-auto scroll-thin">
          {results.map((t) => (
            <button
              key={t.address}
              onClick={() => {
                setOpen(false);
                setQ("");
                router.push(`/trade/${t.address}`);
              }}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/5 text-left"
            >
              <TokenAvatar symbol={t.symbol} logoURI={t.logoURI} size={30} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-white truncate">
                  {t.symbol}
                </span>
                <span className="block text-xs text-muted truncate">{t.name}</span>
              </span>
              <ChangeText value={t.change24h} className="text-xs" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
