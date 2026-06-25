import { Logo } from "@/components/Logo";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/components/StoreButtons";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Trade", href: "/trade" },
      { label: "Portfolio", href: "/portfolio" },
      { label: "Features", href: "/#features" },
      { label: "Chad Board", href: "/#leaderboard" },
      { label: "System status", href: "/status" },
    ],
  },
  {
    title: "Get the app",
    links: [
      { label: "iOS", href: APP_STORE_URL },
      { label: "Android", href: PLAY_STORE_URL },
    ],
  },
  {
    title: "Social",
    links: [
      { label: "X / Twitter", href: "https://x.com" },
      { label: "Discord", href: "#" },
      { label: "Telegram", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line/60 bg-ink">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
        <div className="grid sm:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10">
          <div className="max-w-xs">
            <Logo size={28} />
            <p className="mt-3 text-sm text-muted">
              The #1 meme coin trading app on Solana. Self-custody, social, and
              fast.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title} className="flex flex-col gap-2.5">
              <span className="text-faint font-semibold uppercase text-xs tracking-wide">
                {col.title}
              </span>
              {col.links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target={l.href.startsWith("http") ? "_blank" : undefined}
                  rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="text-sm text-muted hover:text-white"
                >
                  {l.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-12 pt-6 border-t border-line/60 flex flex-col sm:flex-row justify-between gap-3 text-xs text-faint">
          <span>© {new Date().getFullYear()} Chad Wallet L.L.C. All rights reserved.</span>
          <span>Crypto trading involves risk. Not financial advice. Trade responsibly.</span>
        </div>
      </div>
    </footer>
  );
}
