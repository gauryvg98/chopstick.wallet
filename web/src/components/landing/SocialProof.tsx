import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StoreButtons } from "@/components/StoreButtons";

export function SocialProof() {
  return (
    <section className="relative overflow-hidden py-24">
      {/* concentric gradient rings */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {[680, 520, 360, 220].map((s, i) => (
          <div
            key={s}
            className="absolute rounded-full border border-chad/15"
            style={{ width: s, height: s, opacity: 0.6 - i * 0.1 }}
          />
        ))}
        <div className="absolute h-72 w-72 rounded-full bg-chad/20 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
        {/* App demo — loops silently */}
        <div className="flex justify-center lg:justify-end">
          <video
            src="/brand/demo.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-label="ChadWallet app demo"
            className="block h-[400px] sm:h-[480px] lg:h-[540px] w-auto rounded-[2rem] border border-line-2 shadow-2xl bg-ink ring-1 ring-white/5"
          />
        </div>

        {/* Pitch + get-the-app */}
        <div className="text-center lg:text-left">
          <h2 className="font-display font-bold text-4xl sm:text-6xl tracking-tight lowercase">
            a trading app
            <br />
            for the rest of us.
          </h2>
          <p className="mt-5 text-lg text-muted">
            Join <span className="text-white font-bold">500k+</span> traders making
            their name on ChadWallet.
          </p>

          <div className="mt-8 flex flex-col items-center lg:items-start gap-5">
            <Link href="/trade">
              <Button size="lg">Start trading</Button>
            </Link>
            <StoreButtons className="justify-center lg:justify-start" />
          </div>
        </div>
      </div>
    </section>
  );
}
