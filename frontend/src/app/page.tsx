"use client";

import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { getActiveNotes, getNotes } from "@/lib/notes";
import { useEffect, useState } from "react";

export default function Home() {
  const { address } = useWallet();
  const [noteCount, setNoteCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    setNoteCount(getNotes().length);
    setActiveCount(getActiveNotes().length);
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight">
          Private by Default.
          <br />
          <span className="text-zinc-500">Compliant by Choice.</span>
        </h1>
        <p className="mt-4 max-w-lg text-lg text-zinc-400">
          DShield is a shielded stablecoin wallet on Stellar. Send and receive
          USDC privately using Zero-Knowledge Proofs.
        </p>
      </div>

      {address ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/deposit"
            className="group rounded-xl border border-zinc-800 bg-zinc-900 p-6 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
          >
            <h2 className="text-lg font-semibold group-hover:text-white">
              Deposit
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Shield your funds by depositing into the privacy pool.
            </p>
          </Link>

          <Link
            href="/withdraw"
            className="group rounded-xl border border-zinc-800 bg-zinc-900 p-6 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
          >
            <h2 className="text-lg font-semibold group-hover:text-white">
              Withdraw
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Withdraw shielded funds with a zero-knowledge proof.
            </p>
            <p className="mt-3 text-xs font-mono text-zinc-600">
              {activeCount} active note{activeCount !== 1 ? "s" : ""}
            </p>
          </Link>

          <Link
            href="/compliance"
            className="group rounded-xl border border-zinc-800 bg-zinc-900 p-6 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
          >
            <h2 className="text-lg font-semibold group-hover:text-white">
              Compliance
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Prove compliance without revealing your identity.
            </p>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-400">Connect your wallet to get started.</p>
        </div>
      )}

      {address && noteCount > 0 && (
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
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
      )}
    </div>
  );
}
