"use client";

import { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  buildContractCall,
  submitTransaction,
  queryContract,
  POOL_CONTRACT_ID,
} from "@/lib/stellar";
import { getActiveNotes, markNoteSpent, type ShieldedNote } from "@/lib/notes";
import { getAllCommitments } from "@/lib/deposits";
import {
  computeNullifierHash,
  buildMerkleTree,
} from "@/lib/poseidon2";
import * as StellarSdk from "@stellar/stellar-sdk";

type WithdrawStep =
  | "idle"
  | "checking_nullifier"
  | "building_tree"
  | "generating_proof"
  | "signing"
  | "submitting"
  | "done";

const STEP_LABELS: Record<WithdrawStep, string> = {
  idle: "",
  checking_nullifier: "Checking if note is already spent...",
  building_tree: "Building Merkle tree from deposits...",
  generating_proof: "Generating ZK proof (this may take a minute)...",
  signing: "Signing transaction...",
  submitting: "Submitting transaction...",
  done: "Withdrawal complete!",
};

export default function WithdrawPage() {
  const { address, signTransaction } = useWallet();
  const [status, setStatus] = useState("");
  const [step, setStep] = useState<WithdrawStep>("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedNote, setSelectedNote] = useState<ShieldedNote | null>(null);

  const activeNotes = typeof window !== "undefined" ? getActiveNotes() : [];

  async function handleAutomatedWithdraw() {
    if (!address || !selectedNote) return;
    if (!POOL_CONTRACT_ID) {
      setStatus("Error: Pool contract ID not configured.");
      return;
    }

    setIsLoading(true);
    setStatus("");

    try {
      setStep("checking_nullifier");
      const nullifierHash = await computeNullifierHash(selectedNote.nullifier);
      const nullifierHashClean = nullifierHash.replace(/^0x/, "");

      const isUsed = await queryContract(
        POOL_CONTRACT_ID,
        "is_nullifier_used",
        [
          StellarSdk.xdr.ScVal.scvBytes(
            Buffer.from(nullifierHashClean, "hex"),
          ),
        ],
      );
      if (isUsed && StellarSdk.scValToNative(isUsed) === true) {
        setStep("idle");
        setStatus("Error: This note has already been spent on-chain.");
        setIsLoading(false);
        return;
      }

      setStep("building_tree");
      const rootVal = await queryContract(POOL_CONTRACT_ID, "get_root");
      if (!rootVal) {
        setStep("idle");
        setStatus("Error: No Merkle root found. Has any deposit been made?");
        setIsLoading(false);
        return;
      }
      const rootBytes = StellarSdk.scValToNative(rootVal) as Buffer;
      const onChainRoot = "0x" + Buffer.from(rootBytes).toString("hex");

      const commitments = getAllCommitments();
      if (commitments.length === 0) {
        setStep("idle");
        setStatus(
          "Error: No deposit history found locally. Cannot reconstruct Merkle tree. " +
          "Make sure you deposited from this browser.",
        );
        setIsLoading(false);
        return;
      }

      const merkle = await buildMerkleTree(commitments, selectedNote.leafIndex);

      if (merkle.root.toLowerCase() !== onChainRoot.toLowerCase()) {
        setStep("idle");
        setStatus(
          "Error: Local Merkle root doesn't match on-chain root. " +
          "This can happen if deposits were made from another browser. " +
          `Local: ${merkle.root.slice(0, 18)}... On-chain: ${onChainRoot.slice(0, 18)}...`,
        );
        setIsLoading(false);
        return;
      }

      setStep("generating_proof");
      const proofResponse = await fetch("/api/prove-withdrawal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nullifier: selectedNote.nullifier,
          secret: selectedNote.secret,
          root: onChainRoot,
          nullifierHash: nullifierHash,
          pathSiblings: merkle.pathSiblings,
          pathBits: merkle.pathBits,
        }),
      });

      if (!proofResponse.ok) {
        const errorBody = await proofResponse.json();
        setStep("idle");
        setStatus(`Error: ${errorBody.error || "Proof generation failed"}`);
        setIsLoading(false);
        return;
      }

      const { proof, publicInputs } = await proofResponse.json();

      setStep("signing");
      const publicInputsScVal = StellarSdk.xdr.ScVal.scvBytes(
        Buffer.from(publicInputs, "hex"),
      );
      const proofScVal = StellarSdk.xdr.ScVal.scvBytes(
        Buffer.from(proof, "hex"),
      );

      const tx = await buildContractCall(
        POOL_CONTRACT_ID,
        "withdraw",
        [publicInputsScVal, proofScVal],
        address,
      );

      const signedXdr = await signTransaction(tx.toXDR());

      setStep("submitting");
      const txHash = await submitTransaction(signedXdr);

      markNoteSpent(selectedNote.commitment);
      setSelectedNote(null);
      setStep("done");
      setStatus(`Withdrawal successful! TX: ${txHash.slice(0, 12)}...`);
    } catch (err) {
      setStep("idle");
      let errorMessage = "Unknown error";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === "string") {
        errorMessage = err;
      } else if (err && typeof err === "object") {
        errorMessage = JSON.stringify(err);
      }
      console.error("Withdrawal error:", err);
      setStatus(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold">Withdraw</h1>
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-400">Connect your wallet to withdraw.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold">Withdraw from Shielded Pool</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Prove you own a note in the Merkle tree without revealing which one.
        The ZK proof is generated automatically.
      </p>

      <div className="mt-8 space-y-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="text-sm font-medium text-zinc-400">
            Select a Note ({activeNotes.length} available)
          </h3>
          {activeNotes.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              No active notes. Deposit funds first.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {activeNotes.map((note) => (
                <button
                  key={note.commitment}
                  onClick={() => !isLoading && setSelectedNote(note)}
                  disabled={isLoading}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                    selectedNote?.commitment === note.commitment
                      ? "border-white bg-zinc-800"
                      : "border-zinc-800 hover:border-zinc-700"
                  } disabled:opacity-50`}
                >
                  <div className="font-mono text-xs text-zinc-300">
                    {note.commitment.slice(0, 16)}...
                    {note.commitment.slice(-16)}
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-zinc-500">
                    <span>
                      Created {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                    <span>Leaf #{note.leafIndex}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedNote && (
          <>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="mb-3 text-sm font-medium text-zinc-400">
                Note Details
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div>
                  <span className="text-zinc-500">Nullifier: </span>
                  <span className="text-zinc-300 break-all">
                    {selectedNote.nullifier}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Secret: </span>
                  <span className="text-zinc-300 break-all">
                    {selectedNote.secret}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Leaf Index: </span>
                  <span className="text-zinc-300">
                    {selectedNote.leafIndex}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleAutomatedWithdraw}
              disabled={isLoading}
              className="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Processing..." : "Generate Proof & Withdraw"}
            </button>
          </>
        )}

        {step !== "idle" && step !== "done" && (
          <div className="rounded-lg bg-zinc-800 p-4">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-white" />
              <span className="text-sm text-zinc-300">
                {STEP_LABELS[step]}
              </span>
            </div>
            <div className="mt-3 flex gap-1">
              {(
                [
                  "checking_nullifier",
                  "building_tree",
                  "generating_proof",
                  "signing",
                  "submitting",
                ] as WithdrawStep[]
              ).map((s, i) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full ${
                    stepIndex(step) >= i
                      ? "bg-white"
                      : "bg-zinc-700"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {status && (
          <div
            className={`rounded-lg p-3 text-sm ${
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
      </div>
    </div>
  );
}

function stepIndex(s: WithdrawStep): number {
  const order: WithdrawStep[] = [
    "checking_nullifier",
    "building_tree",
    "generating_proof",
    "signing",
    "submitting",
  ];
  return order.indexOf(s);
}
