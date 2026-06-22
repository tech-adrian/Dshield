"use client";

import { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  buildContractCall,
  submitTransaction,
  POOL_CONTRACT_ID,
  queryContract,
} from "@/lib/stellar";
import { saveNote, generateRandomField } from "@/lib/notes";
import { saveDeposit } from "@/lib/deposits";
import { computeCommitment } from "@/lib/poseidon2";
import * as StellarSdk from "@stellar/stellar-sdk";

export default function DepositPage() {
  const { address, signTransaction } = useWallet();
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastCommitment, setLastCommitment] = useState<string>("");
  const [amount, setAmount] = useState<string>("1000000");

  async function handleDeposit() {
    if (!address) return;
    if (!POOL_CONTRACT_ID) {
      setStatus("Error: Pool contract ID not configured.");
      return;
    }

    setIsLoading(true);
    setStatus("Generating nullifier and secret...");

    try {
      const nullifier = generateRandomField();
      const secret = generateRandomField();

      setStatus("Computing Poseidon2 commitment...");
      const commitment = await computeCommitment(nullifier, secret);
      const commitmentClean = commitment.replace(/^0x/, "");

      setStatus("Querying current tree index...");
      const nextIndexVal = await queryContract(
        POOL_CONTRACT_ID,
        "get_next_index",
      );
      const leafIndex = nextIndexVal
        ? Number(StellarSdk.scValToNative(nextIndexVal))
        : 0;

      setStatus("Building transaction...");
      const commitmentScVal = StellarSdk.xdr.ScVal.scvBytes(
        Buffer.from(commitmentClean, "hex"),
      );

      const tx = await buildContractCall(
        POOL_CONTRACT_ID,
        "deposit",
        [commitmentScVal],
        address,
      );

      setStatus("Signing transaction...");
      const signedXdr = await signTransaction(tx.toXDR());

      setStatus("Submitting transaction...");
      const txHash = await submitTransaction(signedXdr);

      saveNote({
        nullifier,
        secret,
        commitment: commitmentClean,
        leafIndex,
        amount,
        spent: false,
        createdAt: Date.now(),
      });

      saveDeposit({
        commitment: commitmentClean,
        leafIndex,
        timestamp: Date.now(),
      });

      setLastCommitment(commitmentClean);
      setStatus(`Deposit successful! TX: ${txHash.slice(0, 12)}...`);
    } catch (err) {
      let errorMessage = "Unknown error";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === "string") {
        errorMessage = err;
      } else if (err && typeof err === "object") {
        errorMessage = JSON.stringify(err);
      }
      console.error("Deposit error:", err);
      setStatus(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold">Deposit</h1>
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-400">Connect your wallet to deposit.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold">Deposit into Shielded Pool</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Your funds are shielded using a cryptographic commitment. The commitment
        is stored on-chain but reveals nothing about your identity or balance.
      </p>

      <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400">How it works</h3>
          <ol className="mt-3 space-y-2 text-sm text-zinc-500">
            <li>1. A random nullifier and secret are generated locally</li>
            <li>2. A Poseidon2 commitment is computed from these values</li>
            <li>3. The commitment is added to the on-chain Merkle tree</li>
            <li>4. Your note (nullifier + secret) is saved in your browser</li>
          </ol>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs text-zinc-500">
            Amount (stroops)
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value.trim())}
            placeholder="1000000"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-300 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-600">
            This amount is stored privately in your note for compliance proofs.
          </p>
        </div>

        <button
          onClick={handleDeposit}
          disabled={isLoading || !POOL_CONTRACT_ID || !amount}
          className="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Processing..." : "Shield Funds"}
        </button>

        {!POOL_CONTRACT_ID && (
          <p className="mt-3 text-xs text-yellow-500">
            Pool contract ID not configured. Set NEXT_PUBLIC_POOL_CONTRACT_ID in
            your .env.local file.
          </p>
        )}

        {status && (
          <div
            className={`mt-4 rounded-lg p-3 text-sm ${
              status.startsWith("Error")
                ? "bg-red-900/30 text-red-400"
                : status.includes("successful")
                  ? "bg-green-900/30 text-green-400"
                  : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {status}
          </div>
        )}

        {lastCommitment && (
          <div className="mt-4 rounded-lg bg-zinc-800 p-3">
            <p className="text-xs text-zinc-500">Commitment (Poseidon2 hash)</p>
            <p className="mt-1 break-all font-mono text-xs text-zinc-300">
              {lastCommitment}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
