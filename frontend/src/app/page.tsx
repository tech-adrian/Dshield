"use client";

import Image from "next/image";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { getActiveNotes, getNotes } from "@/lib/notes";
import { useLayoutEffect, useState } from "react";

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
      />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
      />
    </svg>
  );
}

function EyeSlashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}

function CheckBadgeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
      />
    </svg>
  );
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"
      />
    </svg>
  );
}

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
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/20 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-5xl px-4 pt-12 pb-12 text-center sm:px-6 sm:pt-20 sm:pb-16">
          <div className="flex justify-center mb-8">
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
            <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Compliant by Choice.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-zinc-400 leading-relaxed sm:mt-6 sm:text-lg">
            DShield is a shielded stablecoin wallet on Stellar. Deposit and
            withdraw USDC privately using Zero-Knowledge Proofs — while retaining
            the ability to prove compliance when you choose to.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            {address ? (
              <Link
                href="/deposit"
                className="rounded-xl bg-white px-8 py-3 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
              >
                Launch App
              </Link>
            ) : (
              <button
                onClick={connect}
                disabled={isConnecting}
                className="rounded-xl bg-white px-8 py-3 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
              >
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </button>
            )}
            <a
              href="https://github.com/tech-adrian/Dshield"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-zinc-700 px-8 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Note summary (if connected) */}
      {address && noteCount > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
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
          </div>
        </section>
      )}

      {/* Features grid */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 transition-colors hover:border-zinc-700"
            >
              <Icon className="h-6 w-6 text-indigo-400" />
              <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                {description}
              </p>
            </div>
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
              <div className="flex gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700 sm:gap-6 sm:p-6">
                <div className="flex-shrink-0">
                  <span className="text-2xl font-bold text-zinc-700 sm:text-3xl">
                    {step}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                    {description}
                  </p>
                  <p className="mt-3 font-mono text-xs text-zinc-600">
                    {detail}
                  </p>
                </div>
              </div>
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
          {[
            {
              label: "DShield Wallet",
              sub: "Next.js + Freighter",
              color: "border-indigo-500/30 bg-indigo-950/20",
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
          ].map(({ label, sub, color }, i, arr) => (
            <div key={label} className="w-full max-w-md">
              <div
                className={`rounded-xl border p-4 text-center ${color}`}
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

      {/* Tech stack */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-center text-2xl font-bold">Tech Stack</h2>
        <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {STACK.map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
            >
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-1 text-sm font-medium text-white">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-indigo-950/30 to-zinc-900 p-6 text-center sm:p-10">
          <h2 className="text-2xl font-bold">Ready to go private?</h2>
          <p className="mt-3 text-sm text-zinc-400">
            Connect your Freighter wallet and shield your first USDC deposit.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/deposit"
              className="rounded-xl bg-white px-8 py-3 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
            >
              Deposit
            </Link>
            <Link
              href="/withdraw"
              className="rounded-xl border border-zinc-700 px-8 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Withdraw
            </Link>
            <Link
              href="/compliance"
              className="rounded-xl border border-zinc-700 px-8 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Compliance
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
