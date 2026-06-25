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

      <div className="relative mx-auto max-w-2xl px-4 sm:px-6 text-center">
        <h2 className="font-display font-bold text-4xl sm:text-6xl tracking-tight lowercase">
          a trading app
          <br />
          for the rest of us.
        </h2>
        <p className="mt-5 text-lg text-muted">
          Join <span className="text-white font-bold">500k+</span> traders making
          their name on ChadWallet.
        </p>

        <div className="mt-8 flex flex-col items-center gap-5">
          <Link href="/trade">
            <Button size="lg">Start trading</Button>
          </Link>
          <StoreButtons className="justify-center" />
        </div>
      </div>
    </section>
  );
}
