"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const GRADIENTS = [
  "from-pink-500 to-rose-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-sky-400 to-indigo-500",
  "from-violet-500 to-fuchsia-500",
  "from-lime-400 to-green-500",
  "from-cyan-400 to-blue-500",
  "from-yellow-400 to-amber-500",
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Token logo with a deterministic gradient + initials fallback. */
export function TokenAvatar({
  symbol,
  logoURI,
  size = 36,
  className,
  onClick,
}: {
  symbol: string;
  logoURI?: string | null;
  size?: number;
  className?: string;
  /** When set the avatar becomes a button (e.g. to pop a spotlight). */
  onClick?: (e: React.MouseEvent) => void;
}) {
  const [broken, setBroken] = useState(false);
  const gradient = GRADIENTS[hash(symbol) % GRADIENTS.length];
  const initials = symbol.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
  const interactive = onClick
    ? "cursor-pointer hover:ring-2 hover:ring-solis/60 transition-shadow"
    : "";
  const title = onClick ? `${symbol} — quick view` : undefined;

  if (logoURI && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoURI}
        alt={symbol}
        width={size}
        height={size}
        onClick={onClick}
        title={title}
        onError={() => setBroken(true)}
        className={cn("rounded-full object-cover bg-surface-2", interactive, className)}
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-gradient-to-br font-bold text-white/95",
        gradient,
        interactive,
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-label={symbol}
    >
      {initials}
    </span>
  );
}
