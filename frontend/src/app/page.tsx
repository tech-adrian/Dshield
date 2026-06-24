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
} from "@/components/icons";

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

const STACK = [
  { label: "Blockchain", value: "Stellar / Soroban" },
  { label: "ZK Circuit", value: "Noir + UltraHonk" },
  { label: "Hashing", value: "Poseidon2 (BN254)" },
  { label: "Verification", value: "BN254 pairing checks" },
  { label: "Frontend", value: "Next.js + TypeScript" },
  { label: "Wallet", value: "Freighter" },
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
        <div className="relative mx-auto max-w-5xl px-4 pt-12 pb-12 text-center sm:px-6 sm:pt-20 sm:pb-16">
          <div className="mb-8 flex justify-center">
            <Image
              src="/dshield.png"
              alt="DShield"
              width={120}
              height={120}
              priority
            />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Private by Default.
            <br />
            <span className="bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text text-transparent">
              Compliant by Choice.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:mt-6 sm:text-lg">
            DShield is a shielded stablecoin wallet on Stellar. Deposit and
            withdraw USDC privately using Zero-Knowledge Proofs — while retaining
            the ability to prove compliance when you choose to.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            {address ? (
              <Link href="/deposit" className={buttonVariants({ size: "lg" })}>
                Launch App
              </Link>
            ) : (
              <Button size="lg" onClick={connect} disabled={isConnecting}>
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </Button>
            )}
            <a
              href="https://github.com/tech-adrian/Dshield"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Note summary (if connected) */}
      {address && noteCount > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
          <Card>
            <h3 className="text-sm font-medium text-zinc-400">Your Notes</h3>
            <div className="mt-3 flex gap-6 text-sm">
              <div>
                <span className="text-2xl font-bold">{activeCount}</span>
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
              <Icon className="h-6 w-6 text-brand-400" />
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
        <h2 className="text-center text-2xl font-bold">How It Works</h2>
        <p className="mt-2 text-center text-sm text-zinc-500">
          Three steps from public to private
        </p>

        <div className="mt-12 space-y-2">
          {HOW_IT_WORKS.map(({ step, title, description, detail }, i) => (
            <div key={step}>
              <Card interactive className="flex gap-4 p-4 sm:gap-6 sm:p-6">
                <div className="flex-shrink-0">
                  <span className="text-2xl font-bold text-zinc-700 sm:text-3xl">
                    {step}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {description}
                  </p>
                  <p className="mt-3 font-mono text-xs text-zinc-600">
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
        <h2 className="text-center text-2xl font-bold">Architecture</h2>
        <p className="mt-2 text-center text-sm text-zinc-500">
          End-to-end ZK privacy on Stellar
        </p>

        <div className="mt-12 flex flex-col items-center gap-3">
          {ARCHITECTURE.map(({ label, sub, color }, i, arr) => (
            <div key={label} className="w-full max-w-md">
              <div className={`rounded-2xl border p-4 text-center ${color}`}>
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

      {/* Tech stack */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-center text-2xl font-bold">Tech Stack</h2>
        <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {STACK.map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
            >
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-1 text-sm font-medium text-white">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-brand-950/30 to-zinc-900 p-6 text-center sm:p-10">
          <h2 className="text-2xl font-bold">Ready to go private?</h2>
          <p className="mt-3 text-sm text-zinc-400">
            Connect your Freighter wallet and shield your first USDC deposit.
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
      </section>
    </div>
  );
}
