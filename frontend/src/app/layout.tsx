import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import { Background } from "@/components/Background";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ToastProvider } from "@/components/ui/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dshield.vercel.app"),
  title: "DShield - Shielded Stablecoin Wallet",
  description:
    "Private by Default. Compliant by Choice. A shielded USDC wallet on Stellar using Zero-Knowledge Proofs.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
  openGraph: {
    title: "DShield - Shielded Stablecoin Wallet",
    description:
      "Private USDC payments on Stellar with Zero-Knowledge Proofs. Compliant selective disclosure built in.",
    images: [{ url: "/dshield.png", width: 800, height: 800 }],
  },
  twitter: {
    card: "summary",
    title: "DShield",
    description:
      "Private by Default. Compliant by Choice. Shielded USDC on Stellar.",
    images: ["/dshield.png"],
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
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-white">
        <Background />
        <WalletProvider>
          <ToastProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
