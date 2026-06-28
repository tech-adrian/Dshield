"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { getActiveNotes, getNotes } from "@/lib/notes";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  ShieldIcon,
  LockIcon,
  EyeSlashIcon,
  CheckBadgeIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  BoltIcon,
  CodeIcon,
  GithubIcon,
} from "@/components/icons";

const GITHUB_URL = "https://github.com/tech-adrian/Dshield";

const TRUST = [
  { icon: BoltIcon, label: "Live on Stellar Testnet" },
  { icon: LockIcon, label: "Client-side ZK proofs" },
  { icon: CodeIcon, label: "Open source" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Deposit",
    description:
      "Deposit USDC into the shielded pool. A Poseidon2 cryptographic commitment is created and stored on-chain — it reveals nothing about your identity or balance.",
    detail: "commitment = Poseidon2(nullifier, secret)",
  },
  {
    step: "02",
    title: "Private Withdrawal",
    description:
      "Generate a Zero-Knowledge Proof in your browser that proves you own a note in the pool — without revealing which one. A relayer submits the transaction so your address never appears on-chain.",
    detail: "ZK proof verifies Merkle inclusion + nullifier",
  },
  {
    step: "03",
    title: "Selective Disclosure",
    description:
      "Need to prove compliance? Generate a targeted proof for an auditor that proves KYC completion or fund ownership — without exposing your full transaction history.",
    detail: "Prove what's true. Reveal nothing else.",
  },
];

const FEATURES = [
  {
    icon: EyeSlashIcon,
    title: "Hidden Balances",
    description: "Wallet balances and transaction amounts stay private.",
  },
  {
    icon: ShieldIcon,
    title: "Unlinkable Withdrawals",
    description:
      "Relayed transactions mean your address never appears on-chain.",
  },
  {
    icon: CheckBadgeIcon,
    title: "Compliance Ready",
    description:
      "Prove KYC and fund legitimacy with ZK proofs — no personal data exposed.",
  },
  {
    icon: LockIcon,
    title: "Client-Side Proofs",
    description:
      "All sensitive data stays on your device. Nothing leaves the browser.",
  },
];

const ARCHITECTURE = [
  {
    label: "DShield Wallet",
    sub: "Next.js + Freighter",
    color: "border-brand-500/30 bg-brand-950/20",
  },
  {
    label: "Client-Side Prover",
    sub: "Noir / Barretenberg (WASM)",
    color: "border-cyan-500/30 bg-cyan-950/20",
  },
  {
    label: "Shielded Pool",
    sub: "Commitments + Nullifiers + Merkle Tree",
    color: "border-violet-500/30 bg-violet-950/20",
  },
  {
    label: "Soroban Verifier",
    sub: "UltraHonk / BN254 Pairing Checks",
    color: "border-purple-500/30 bg-purple-950/20",
  },
  {
    label: "Stellar Network",
    sub: "Testnet (Protocol 26)",
    color: "border-zinc-500/30 bg-zinc-900",
  },
];

/** Small uppercase eyebrow used above each section heading. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">
      {children}
    </p>
  );
}

export default function Home() {
  const { address, connect, isConnecting } = useWallet();
  const [noteCount, setNoteCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    setNoteCount(getNotes().length);
    setActiveCount(getActiveNotes().length);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-5xl px-4 pt-14 pb-12 text-center sm:px-6 sm:pt-24 sm:pb-20">
          {/* Logo with glow */}
          <div className="animate-fade-up delay-100 mt-8 mb-8 flex justify-center">
            <div className="relative">
              <div
                className="absolute inset-0 -z-10 rounded-full bg-brand-500/30 blur-3xl"
                aria-hidden="true"
              />
              <Image
                src="/dshield.png"
                alt="DShield"
                width={120}
                height={120}
                priority
                className="drop-shadow-[0_0_25px_rgba(99,102,241,0.25)]"
              />
            </div>
          </div>

          <h1 className="animate-fade-up delay-100 text-balance text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Private by Default.
            <br />
            <span className="bg-gradient-to-r from-brand-400 via-accent-400 to-brand-400 bg-clip-text text-transparent">
              Compliant by Choice.
            </span>
          </h1>
          <p className="animate-fade-up delay-200 mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400 sm:mt-6 sm:text-lg">
            DShield is a shielded stablecoin wallet on Stellar. Deposit and
            withdraw USDC privately using Zero-Knowledge Proofs — while retaining
            the ability to prove compliance whenever you choose to.
          </p>

          <div className="animate-fade-up delay-200 mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {address ? (
              <Link href="/deposit" className={buttonVariants({ size: "lg" })}>
                Launch App
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            ) : (
              <Button size="lg" onClick={connect} disabled={isConnecting}>
                {isConnecting ? "Connecting..." : "Connect Wallet"}
                {!isConnecting && <ArrowRightIcon className="h-4 w-4" />}
              </Button>
            )}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <GithubIcon className="h-4 w-4" />
              View on GitHub
            </a>
          </div>

          {/* Trust strip */}
          <div className="animate-fade-up delay-300 mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {TRUST.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 text-xs font-medium text-zinc-500"
              >
                <Icon className="h-4 w-4 text-brand-400/80" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Note summary (if connected) */}
      {address && noteCount > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
          <Card border="brand">
            <h3 className="text-sm font-medium text-zinc-400">Your Notes</h3>
            <div className="mt-3 flex gap-8 text-sm">
              <div>
                <span className="text-2xl font-bold text-white">
                  {activeCount}
                </span>
                <span className="ml-2 text-zinc-500">active</span>
              </div>
              <div>
                <span className="text-2xl font-bold text-zinc-600">
                  {noteCount - activeCount}
                </span>
                <span className="ml-2 text-zinc-500">spent</span>
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* Features grid */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card key={title} interactive>
              <div className="inline-flex rounded-xl border border-brand-500/20 bg-brand-500/10 p-2.5">
                <Icon className="h-5 w-5 text-brand-400" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                {description}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <Eyebrow>Workflow</Eyebrow>
        <h2 className="mt-3 text-center text-3xl font-bold tracking-tight">
          How It Works
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-500">
          Three steps from public to private
        </p>

        <div className="mt-12 space-y-2">
          {HOW_IT_WORKS.map(({ step, title, description, detail }, i) => (
            <div key={step}>
              <Card interactive className="flex gap-4 p-4 sm:gap-6 sm:p-6">
                <div className="flex-shrink-0">
                  <span className="bg-gradient-to-b from-zinc-600 to-zinc-800 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
                    {step}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {description}
                  </p>
                  <p className="mt-3 inline-block rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1 font-mono text-xs text-brand-300/80">
                    {detail}
                  </p>
                </div>
              </Card>
              {i < HOW_IT_WORKS.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDownIcon className="h-5 w-5 text-zinc-700" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <Eyebrow>Under the hood</Eyebrow>
        <h2 className="mt-3 text-center text-3xl font-bold tracking-tight">
          Architecture
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-500">
          End-to-end ZK privacy on Stellar
        </p>

        <div className="mt-12 flex flex-col items-center gap-3">
          {ARCHITECTURE.map(({ label, sub, color }, i, arr) => (
            <div key={label} className="w-full max-w-md">
              <div
                className={`rounded-2xl border p-4 text-center backdrop-blur-sm transition-transform hover:scale-[1.02] ${color}`}
              >
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="mt-1 text-xs text-zinc-400">{sub}</p>
              </div>
              {i < arr.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDownIcon className="h-4 w-4 text-zinc-700" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="gradient-border rounded-3xl">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-950/40 via-zinc-900 to-zinc-900 p-8 text-center sm:p-12">
            <div
              className="absolute inset-x-0 -top-24 -z-0 mx-auto h-48 w-48 rounded-full bg-brand-500/20 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight">
                Ready to go private?
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
                Connect your Freighter wallet and shield your first USDC deposit
                in seconds.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link href="/deposit" className={buttonVariants({ size: "lg" })}>
                  Deposit
                </Link>
                <Link
                  href="/withdraw"
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  Withdraw
                </Link>
                <Link
                  href="/compliance"
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  Compliance
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
