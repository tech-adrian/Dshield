"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  buildContractCall,
  submitTransaction,
  queryContract,
  getPoolTiers,
  ensureUsdcTrustline,
  faucetUsdc,
  getUsdcSacId,
  type PoolTier,
} from "@/lib/stellar";
import { saveNote, generateRandomField } from "@/lib/notes";
import { saveDeposit } from "@/lib/deposits";
import { computeCommitment } from "@/lib/poseidon2";
import * as StellarSdk from "@stellar/stellar-sdk";

const TOKEN_DECIMALS = 7;
const TOKEN_SYMBOL = "USDC";

function formatAmount(stroops: number): string {
  return `${(stroops / 10 ** TOKEN_DECIMALS).toFixed(0)} ${TOKEN_SYMBOL}`;
}

export default function DepositPage() {
  const { address, signTransaction } = useWallet();
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastCommitment, setLastCommitment] = useState<string>("");
  const [tiers, setTiers] = useState<PoolTier[]>([]);
  const [selectedTier, setSelectedTier] = useState<PoolTier | null>(null);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [noteCount, setNoteCount] = useState<number>(1);

  useEffect(() => {
    const t = getPoolTiers();
    setTiers(t);
    if (t.length > 0) setSelectedTier(t[0]);
  }, []);

  useEffect(() => {
    if (!customAmount || !selectedTier) {
      setNoteCount(1);
      return;
    }
    const usdc = parseFloat(customAmount);
    if (isNaN(usdc) || usdc <= 0) {
      setNoteCount(0);
      return;
    }
    const tierUsdc = selectedTier.amount / 10 ** TOKEN_DECIMALS;
    setNoteCount(Math.floor(usdc / tierUsdc));
  }, [customAmount, selectedTier]);

  const totalNotes = customAmount ? noteCount : 1;

  async function handleDeposit() {
    if (!address || !selectedTier || totalNotes <= 0) return;

    setIsLoading(true);
    const total = totalNotes;

    try {
      // Make sure the connected wallet can actually hold and pay USDC:
      // establish the trustline (wallet signs) and faucet test funds if short.
      // Both are no-ops once satisfied.
      const sac = getUsdcSacId();
      if (sac) {
        setStatus("Checking USDC trustline...");
        await ensureUsdcTrustline(address, signTransaction);

        const needed = selectedTier.amount * total;
        const balVal = await queryContract(sac, "balance", [
          StellarSdk.nativeToScVal(address, { type: "address" }),
        ]);
        const balance = balVal
          ? BigInt(StellarSdk.scValToNative(balVal) as string | number)
          : BigInt(0);
        if (balance < BigInt(needed)) {
          setStatus("Funding wallet with test USDC...");
          // Mint a generous buffer so subsequent deposits don't re-faucet.
          await faucetUsdc(address, BigInt(needed) * BigInt(2) - balance);
        }
      }

      for (let n = 0; n < total; n++) {
        setStatus(
          total > 1
            ? `Note ${n + 1}/${total}: Generating nullifier and secret...`
            : "Generating nullifier and secret...",
        );

        const nullifier = generateRandomField();
        const secret = generateRandomField();

        const commitment = await computeCommitment(nullifier, secret);
        const commitmentClean = commitment.replace(/^0x/, "");

        const nextIndexVal = await queryContract(
          selectedTier.id,
          "get_next_index",
        );
        const leafIndex = nextIndexVal
          ? Number(StellarSdk.scValToNative(nextIndexVal))
          : 0;

        setStatus(
          total > 1
            ? `Note ${n + 1}/${total}: Building transaction...`
            : "Building transaction...",
        );
        const depositorScVal = StellarSdk.nativeToScVal(address, {
          type: "address",
        });
        const commitmentScVal = StellarSdk.xdr.ScVal.scvBytes(
          Buffer.from(commitmentClean, "hex"),
        );

        const tx = await buildContractCall(
          selectedTier.id,
          "deposit",
          [depositorScVal, commitmentScVal],
          address,
        );

        setStatus(
          total > 1
            ? `Note ${n + 1}/${total}: Signing...`
            : "Signing transaction...",
        );
        const signedXdr = await signTransaction(tx.toXDR());

        setStatus(
          total > 1
            ? `Note ${n + 1}/${total}: Submitting...`
            : "Submitting transaction...",
        );
        await submitTransaction(signedXdr);

        saveNote({
          nullifier,
          secret,
          commitment: commitmentClean,
          leafIndex,
          amount: String(selectedTier.amount),
          spent: false,
          createdAt: Date.now(),
          poolId: selectedTier.id,
        });

        saveDeposit({
          commitment: commitmentClean,
          leafIndex,
          timestamp: Date.now(),
          poolId: selectedTier.id,
        });

        setLastCommitment(commitmentClean);
      }

      const totalUsdc = (total * selectedTier.amount) / 10 ** TOKEN_DECIMALS;
      setStatus(
        `Deposit successful! ${totalUsdc} ${TOKEN_SYMBOL} shielded across ${total} note${total > 1 ? "s" : ""}.`,
      );
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
      setCustomAmount("");
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
            <li>1. Choose a denomination (all deposits in a tier are identical)</li>
            <li>2. A Poseidon2 commitment is computed from random values</li>
            <li>3. Your {TOKEN_SYMBOL} is transferred to the shielded pool</li>
            <li>4. Your note is saved locally for future withdrawal</li>
          </ol>
        </div>

        {tiers.length > 1 && (
          <div className="mb-4">
            <label className="mb-2 block text-xs text-zinc-500">
              Select Denomination
            </label>
            <div className="grid grid-cols-3 gap-2">
              {tiers.map((tier) => (
                <button
                  key={tier.id}
                  onClick={() => setSelectedTier(tier)}
                  disabled={isLoading}
                  className={`rounded-lg border p-3 text-center text-sm font-medium transition-colors ${
                    selectedTier?.id === tier.id
                      ? "border-white bg-zinc-800 text-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  } disabled:opacity-50`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedTier && (
          <div className="mb-4">
            <label className="mb-1 block text-xs text-zinc-500">
              Amount ({TOKEN_SYMBOL})
            </label>
            <input
              type="number"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder={String(selectedTier.amount / 10 ** TOKEN_DECIMALS)}
              min={selectedTier.amount / 10 ** TOKEN_DECIMALS}
              step={selectedTier.amount / 10 ** TOKEN_DECIMALS}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-300 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-600">
              {(() => {
                if (!customAmount) {
                  return `Leave empty for a single ${formatAmount(selectedTier.amount)} deposit. Enter a larger amount to create multiple notes.`;
                }
                const usdc = parseFloat(customAmount);
                const tierUsdc = selectedTier.amount / 10 ** TOKEN_DECIMALS;
                if (isNaN(usdc) || usdc < tierUsdc) {
                  return `Minimum: ${tierUsdc} ${TOKEN_SYMBOL}`;
                }
                const shielded = noteCount * tierUsdc;
                const remainder = usdc - shielded;
                return (
                  <>
                    Creates <span className="text-zinc-400">{noteCount} note{noteCount > 1 ? "s" : ""}</span> of{" "}
                    {formatAmount(selectedTier.amount)} each
                    {" = "}
                    <span className="text-zinc-400">{shielded} {TOKEN_SYMBOL}</span> shielded
                    {remainder > 0 && (
                      <span className="text-yellow-500"> ({remainder} {TOKEN_SYMBOL} remainder not shielded)</span>
                    )}
                  </>
                );
              })()}
            </p>
          </div>
        )}

        <button
          onClick={handleDeposit}
          disabled={isLoading || !selectedTier || (!!customAmount && noteCount <= 0)}
          className="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading
            ? "Processing..."
            : selectedTier
              ? customAmount && noteCount > 1
                ? `Shield ${noteCount * selectedTier.amount / 10 ** TOKEN_DECIMALS} ${TOKEN_SYMBOL} (${noteCount} notes)`
                : `Shield ${formatAmount(selectedTier.amount)}`
              : "Select a denomination"}
        </button>

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
