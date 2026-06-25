import { SiteHeader } from "@/components/SiteHeader";
import { TokenBanner } from "@/components/TokenBanner";
import { Hero } from "@/components/landing/Hero";
import { WebSection } from "@/components/landing/WebSection";
import { FeatureCards } from "@/components/landing/FeatureCards";
import { ChadBoard } from "@/components/landing/ChadBoard";
import { SocialProof } from "@/components/landing/SocialProof";
import { Footer } from "@/components/Footer";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-full">
      <SiteHeader />
      <TokenBanner direction="left" />
      <main className="flex-1">
        <Hero />
        <WebSection />
        <FeatureCards />
        <ChadBoard />
        <SocialProof />
      </main>
      <TokenBanner direction="right" />
      <Footer />
    </div>
  );
}
