import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const SITE = "https://solis.trade";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "SolisMarket — The #1 meme coin trading app on Solana",
    template: "%s · SolisMarket",
  },
  description:
    "Find the next 100x memecoins. Trade any Solana token in seconds, follow top traders, and never miss the next breakout. Sign in with Apple or Google.",
  keywords: [
    "SolisMarket",
    "Solana",
    "memecoin",
    "crypto trading",
    "Jupiter",
    "self-custody wallet",
  ],
  openGraph: {
    title: "SolisMarket — The #1 meme coin trading app on Solana",
    description:
      "Find the next 100x memecoins. Trade any Solana token in seconds. Never miss the next breakout.",
    url: SITE,
    siteName: "SolisMarket",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SolisMarket — The #1 meme coin trading app on Solana",
    description:
      "Find the next 100x memecoins. Trade any Solana token in seconds.",
  },
  icons: {
    icon: "/brand/logo-mark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
