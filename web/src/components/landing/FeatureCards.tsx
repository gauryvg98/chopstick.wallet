const CARDS: {
  title: string;
  body: string;
  icon: string;
  span?: boolean;
}[] = [
  {
    title: "top the Chad board",
    body: "Climb the leaderboard. Biggest gains, most volume, loudest flexes — earn your name.",
    icon: "🏆",
    span: true,
  },
  {
    title: "follow the smart money",
    body: "Discover and follow the traders and KOLs who win consistently, and copy their best plays.",
    icon: "👑",
  },
  {
    title: "real-time whale alerts",
    body: "Get pinged the moment the best are buying. See the move before the chart does.",
    icon: "🔔",
  },
  {
    title: "sign in in seconds",
    body: "Apple or Google — no seed phrase, no extension. A secure Solana wallet, instantly.",
    icon: "⚡",
  },
  {
    title: "built for Solana",
    body: "Every memecoin, every viral token, the fastest chain. Routed through Jupiter for the best price.",
    icon: "◎",
  },
  {
    title: "self-custody, always",
    body: "Your keys, your coins. Deposit, trade, and withdraw in seconds — you stay in control.",
    icon: "🔒",
  },
];

export function FeatureCards() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="font-display font-bold text-4xl sm:text-5xl tracking-tight lowercase">
          never miss out again
        </h2>
        <p className="mt-4 text-lg text-muted">
          Everything you need to find the next 100x and ape in with confidence.
        </p>
      </div>

      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <div
            key={c.title}
            className={`group rounded-3xl border border-line bg-surface/60 p-6 hover:border-chad/40 hover:bg-surface transition-colors ${
              c.span ? "sm:col-span-2 lg:col-span-1 lg:row-span-1" : ""
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-2 border border-line text-2xl">
              {c.icon}
            </div>
            <h3 className="mt-5 font-display font-semibold text-xl text-white lowercase">
              {c.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
