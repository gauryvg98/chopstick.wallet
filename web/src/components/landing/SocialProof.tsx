import Link from "next/link";
import { Button } from "@/components/ui/Button";

export function SocialProof() {
  return (
    <section className="relative overflow-hidden py-24">
      {/* concentric rings with tokens orbiting along them */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {[680, 520, 360, 220].map((s, i) => (
          <div
            key={s}
            className="absolute rounded-full border border-solis/15"
            style={{ width: s, height: s, opacity: 0.6 - i * 0.1 }}
          />
        ))}
        <div className="absolute h-72 w-72 rounded-full bg-solis/20 blur-[100px]" />

        {/* real tokens orbiting the rings — outer container spins (token rides the
            ring), inner counter-spins so the logo stays upright. Negative delays
            spread tokens that share a ring. */}
        {[
          { d: 680, dur: 16, rev: false, img: "bonk", delay: 0 },
          { d: 680, dur: 16, rev: false, img: "pengu", delay: -8 },
          { d: 520, dur: 12, rev: true, img: "wif", delay: 0 },
          { d: 520, dur: 12, rev: true, img: "wen", delay: -6 },
          { d: 360, dur: 9, rev: false, img: "jup", delay: 0 },
          { d: 360, dur: 9, rev: false, img: "popcat", delay: -4.5 },
        ].map((o, i) => (
          <div
            key={i}
            className="absolute"
            style={{ width: o.d, height: o.d, animation: `orbit ${o.dur}s linear ${o.delay}s infinite${o.rev ? " reverse" : ""}` }}
          >
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
              <div style={{ animation: `orbit ${o.dur}s linear ${o.delay}s infinite${o.rev ? "" : " reverse"}` }}>
                <div className="h-11 w-11 overflow-hidden rounded-full bg-ink shadow-lg ring-2 ring-ink/70">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/brand/tokens/${o.img}.png`} alt="" className="h-full w-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
        {/* App demo — loops silently */}
        <div className="flex justify-center lg:justify-start lg:ml-4 xl:ml-8">
          <video
            src="/brand/demo.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-label="SolisMarket app demo"
            className="block h-[400px] sm:h-[480px] lg:h-[540px] w-auto rounded-[2rem] border border-line-2 shadow-2xl bg-ink ring-1 ring-white/5"
          />
        </div>

        {/* Pitch + get-the-app */}
        <div className="text-center lg:text-left">
          <h2 className="font-display font-bold text-4xl sm:text-6xl tracking-tight lowercase">
            built for degens.
            <br />
            not quants.
          </h2>
          <p className="mt-5 text-lg text-muted">
            Join <span className="text-white font-bold">500k+</span> traders making
            their name on SolisMarket.
          </p>

          <div className="mt-8 flex flex-col items-center lg:items-start gap-5">
            <Link href="/trade">
              <Button size="lg">Start trading</Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
