"use client";

import { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  buildContractCall,
  submitTransaction,
  COMPLIANCE_CONTRACT_ID,
} from "@/lib/stellar";
import * as StellarSdk from "@stellar/stellar-sdk";

export default function CompliancePage() {
  const { address, signTransaction } = useWallet();
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [proofHex, setProofHex] = useState("");
  const [publicInputsHex, setPublicInputsHex] = useState("");

  async function handleVerifyCompliance() {
    if (!address) return;
    if (!COMPLIANCE_CONTRACT_ID) {
      setStatus("Error: Compliance contract ID not configured.");
      return;
    }
    if (!proofHex || !publicInputsHex) {
      setStatus("Error: Paste the compliance proof and public inputs.");
      return;
    }

    const cleanPublicInputs = publicInputsHex.replace(/^0x/, "").trim();
    const cleanProof = proofHex.replace(/^0x/, "").trim();

    if (!/^[0-9a-fA-F]+$/.test(cleanPublicInputs)) {
      setStatus("Error: Public inputs must be valid hex.");
      return;
    }
    if (!/^[0-9a-fA-F]+$/.test(cleanProof)) {
      setStatus("Error: Proof must be valid hex.");
      return;
    }

    setIsLoading(true);
    setStatus("Building compliance verification transaction...");

    try {
      const publicInputsScVal = StellarSdk.xdr.ScVal.scvBytes(
        Buffer.from(cleanPublicInputs, "hex"),
      );
      const proofScVal = StellarSdk.xdr.ScVal.scvBytes(
        Buffer.from(cleanProof, "hex"),
      );

      const tx = await buildContractCall(
        COMPLIANCE_CONTRACT_ID,
        "verify_compliance",
        [publicInputsScVal, proofScVal],
        address,
      );

      setStatus("Signing transaction...");
      const signedXdr = await signTransaction(tx.toXDR());

      setStatus("Submitting transaction...");
      const txHash = await submitTransaction(signedXdr);

      setStatus(`Compliance verified! TX: ${txHash.slice(0, 12)}...`);
      setProofHex("");
      setPublicInputsHex("");
    } catch (err) {
      let errorMessage = "Unknown error";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === "string") {
        errorMessage = err;
      } else if (err && typeof err === "object") {
        errorMessage = JSON.stringify(err);
      }
      console.error("Compliance error:", err);
      setStatus(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold">Compliance</h1>
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-400">
            Connect your wallet to verify compliance.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold">Selective Disclosure</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Prove KYC compliance and disclose specific transaction details to an
        auditor without revealing your full identity or transaction history.
      </p>

      <div className="mt-8 space-y-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="text-sm font-medium text-zinc-400">How it works</h3>
          <ol className="mt-3 space-y-2 text-sm text-zinc-500">
            <li>
              1. Generate a compliance proof off-chain with{" "}
              <code className="rounded bg-zinc-800 px-1 text-zinc-400">
                just prove-compliance
              </code>
            </li>
            <li>
              2. The proof shows your KYC hash is registered, your note exists in
              the Merkle tree, and reveals only the disclosed amount
            </li>
            <li>3. Submit the proof on-chain for verification</li>
            <li>
              4. The auditor sees the disclosed amount and your KYC status, but
              not your identity or other transactions
            </li>
          </ol>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-3 text-sm font-medium text-zinc-400">
            Compliance Proof Data
          </h3>
          <p className="mb-4 text-xs text-zinc-500">
            The public inputs contain: Merkle root (32B), KYC hash (32B),
            disclosed amount (32B), and auditor key (32B) = 128 bytes total.
          </p>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Public Inputs (hex)
              </label>
              <textarea
                value={publicInputsHex}
                onChange={(e) => setPublicInputsHex(e.target.value.trim())}
                placeholder="Paste public_inputs hex from compliance prover..."
                rows={3}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs text-zinc-300 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Proof (hex)
              </label>
              <textarea
                value={proofHex}
                onChange={(e) => setProofHex(e.target.value.trim())}
                placeholder="Paste proof hex from compliance prover..."
                rows={3}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs text-zinc-300 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleVerifyCompliance}
          disabled={
            isLoading ||
            !proofHex ||
            !publicInputsHex ||
            !COMPLIANCE_CONTRACT_ID
          }
          className="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Verifying..." : "Submit Compliance Proof"}
        </button>

        {!COMPLIANCE_CONTRACT_ID && (
          <p className="text-xs text-yellow-500">
            Compliance contract ID not configured. Set
            NEXT_PUBLIC_COMPLIANCE_CONTRACT_ID in your .env.local file.
          </p>
        )}

        {status && (
          <div
            className={`rounded-lg p-3 text-sm ${
              status.startsWith("Error")
                ? "bg-red-900/30 text-red-400"
                : status.includes("verified")
                  ? "bg-green-900/30 text-green-400"
                  : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
