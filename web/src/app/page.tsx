import { SiteHeader } from "@/components/SiteHeader";
import { TokenBanner } from "@/components/TokenBanner";
import { Hero } from "@/components/landing/Hero";
import { WebSection } from "@/components/landing/WebSection";
import { FeatureCards } from "@/components/landing/FeatureCards";
import { SolisBoard } from "@/components/landing/SolisBoard";
import { SocialProof } from "@/components/landing/SocialProof";
import { Footer } from "@/components/Footer";

export default function LandingPage() {
  return (
    <div className="relative flex flex-col min-h-full">
      {/* Fixed cosmic backdrop — dark base + layered starfield + nebula glows,
          shown through the (transparent) sections above it. */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-ink">
        <div className="absolute inset-0 starfield opacity-70" />
        <div className="absolute inset-0 starfield opacity-40" style={{ backgroundSize: "230px 230px" }} />
        <div className="absolute -top-40 left-[12%] h-[42rem] w-[42rem] rounded-full bg-solis/10 blur-[170px]" />
        <div className="absolute top-1/3 right-[2%] h-[38rem] w-[38rem] rounded-full bg-teal/10 blur-[170px]" />
        <div className="absolute bottom-[4%] left-[28%] h-[34rem] w-[34rem] rounded-full bg-sky/[0.08] blur-[170px]" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col">
        <SiteHeader />
        <TokenBanner direction="left" />
        <main className="flex-1">
          <Hero />
          <WebSection />
          <FeatureCards />
          <SolisBoard />
          <SocialProof />
        </main>
        <TokenBanner direction="right" />
        <Footer />
      </div>
    </div>
  );
}
