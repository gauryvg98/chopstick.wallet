import type { ReactNode } from "react";

/* ---- little in-card mockups (fomo-style: show the feature, don't just say it) ---- */

function LeaderboardMock() {
  const rows = [
    ["🥇", "gigachad", "+$412.8k", "from-chad to-teal"],
    ["🥈", "ansem", "+$318.4k", "from-sky to-teal"],
    ["🥉", "cupsey", "+$244.1k", "from-amber-400 to-down"],
  ];
  return (
    <div className="space-y-2">
      {rows.map(([medal, name, pnl, grad]) => (
        <div key={name} className="flex items-center gap-2.5 rounded-xl bg-ink/70 border border-line px-3 py-2">
          <span className="text-sm">{medal}</span>
          <div className={`h-6 w-6 rounded-full bg-gradient-to-br ${grad}`} />
          <span className="flex-1 truncate text-sm font-semibold text-white">{name}</span>
          <span className="tnum text-xs font-bold text-up">{pnl}</span>
        </div>
      ))}
    </div>
  );
}

function FeedMock() {
  return (
    <div className="rounded-xl bg-ink/70 border border-line p-3">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-chad to-teal" />
        <div className="text-sm text-white">
          <span className="font-semibold">cupsey</span>{" "}
          <span className="text-faint">aped</span>
        </div>
        <span className="ml-auto text-[10px] text-faint">2m</span>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-2 px-2.5 py-2">
        <span className="text-xs font-bold text-white">BONK</span>
        <span className="tnum text-xs font-bold text-up">+142%</span>
      </div>
    </div>
  );
}

function AlertMock() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-ink/70 border border-line px-3 py-2.5">
      <div className="grid h-7 w-7 place-items-center rounded-lg bg-chad/15 text-base">🐳</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">BONK is up 24%</div>
        <div className="text-xs text-muted">50 chads just aped $88,203</div>
      </div>
      <span className="ml-auto text-[10px] text-faint">9:41</span>
    </div>
  );
}

function SignInMock() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-bold text-ink">
         Sign in with Apple
      </div>
      <div className="flex items-center justify-center gap-2 rounded-xl bg-surface-2 border border-line py-2.5 text-sm font-bold text-white">
        <span className="text-chad">G</span> Sign in with Google
      </div>
    </div>
  );
}

function SolanaMock() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-line bg-ink/70 px-3 py-1.5 text-xs font-semibold text-white">◎ Solana</span>
      <span className="rounded-full border border-line bg-ink/70 px-3 py-1.5 text-xs font-semibold text-white">⚡ Jupiter-routed</span>
      <span className="rounded-full border border-line bg-ink/70 px-3 py-1.5 text-xs font-semibold text-white">best price</span>
    </div>
  );
}

function CustodyMock() {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-ink/70 border border-line px-3 py-3">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-chad/15 text-lg">🔒</div>
      <div>
        <div className="text-sm font-semibold text-white">your keys</div>
        <div className="text-xs text-muted">your coins — always</div>
      </div>
      <span className="ml-auto rounded-md bg-chad/15 px-2 py-1 text-[10px] font-bold text-chad">NON-CUSTODIAL</span>
    </div>
  );
}

const FEATURES: { eyebrow: string; title: string; visual: ReactNode; span?: boolean }[] = [
  { eyebrow: "Chad Board", title: "climb the board, earn your name", visual: <LeaderboardMock /> },
  { eyebrow: "Smart money", title: "follow the traders who win", visual: <FeedMock /> },
  { eyebrow: "Whale alerts", title: "see the move before the chart", visual: <AlertMock /> },
  { eyebrow: "Onboarding", title: "sign in in seconds", visual: <SignInMock /> },
  { eyebrow: "Built for Solana", title: "the fastest chain, best price", visual: <SolanaMock /> },
  { eyebrow: "Self-custody", title: "your keys, your coins", visual: <CustodyMock /> },
];

export function FeatureCards() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 sm:px-6 py-24 sm:py-32">
      <div className="max-w-2xl">
        <h2 className="font-display font-bold text-4xl sm:text-5xl tracking-tight lowercase">
          never miss out again
        </h2>
        <p className="mt-4 text-lg text-muted">
          Everything you need to find the next 100x and ape in with confidence.
        </p>
      </div>

      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map((f) => (
          <div
            key={f.eyebrow}
            className="group flex flex-col rounded-3xl border border-line bg-surface/50 p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-chad/40 hover:bg-surface hover:shadow-2xl hover:shadow-chad/10"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-chad">
              {f.eyebrow}
            </span>
            <h3 className="mt-2 font-display font-semibold text-2xl leading-tight text-white lowercase">
              {f.title}
            </h3>
            <div className="mt-6 transition-transform duration-300 ease-out group-hover:-translate-y-2">
              {f.visual}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
