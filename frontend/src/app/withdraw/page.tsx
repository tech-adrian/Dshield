"use client";

import { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  buildContractCall,
  submitTransaction,
  queryContract,
  ensureUsdcTrustline,
  hasUsdcTrustline,
  getUsdcSacId,
  relayWithdrawal,
  POOL_CONTRACT_ID,
} from "@/lib/stellar";
import { getActiveNotes, markNoteSpent, type ShieldedNote } from "@/lib/notes";
import { getAllCommitments, clearDeposits } from "@/lib/deposits";
import {
  computeNullifierHash,
  computeRecipientHash,
  buildMerkleTree,
} from "@/lib/poseidon2";
import {
  syncDepositsFromChain,
  fetchCommitmentsFromChain,
} from "@/lib/indexer";
import { proveWithdrawal } from "@/lib/prover";
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
  const [recipient, setRecipient] = useState("");

  const activeNotes = typeof window !== "undefined" ? getActiveNotes() : [];

  async function handleAutomatedWithdraw() {
    if (!address || !selectedNote) return;
    const poolId = selectedNote.poolId || POOL_CONTRACT_ID;
    if (!poolId) {
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
        poolId,
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
      const rootVal = await queryContract(poolId, "get_root");
      if (!rootVal) {
        setStep("idle");
        setStatus("Error: No Merkle root found. Has any deposit been made?");
        setIsLoading(false);
        return;
      }
      const rootBytes = StellarSdk.scValToNative(rootVal) as Buffer;
      const onChainRoot = "0x" + Buffer.from(rootBytes).toString("hex");

      // Rebuild the tree from the AUTHORITATIVE on-chain commitment list
      // (the contract's get_commitments view). This always returns every leaf
      // in canonical order and does not depend on RPC event retention or local
      // storage, so a tree built from it is guaranteed to match get_root.
      const poolKey = selectedNote.poolId || POOL_CONTRACT_ID;
      setStatus("Fetching commitments from chain...");
      const chainCommitments = await fetchCommitmentsFromChain(poolId);

      let commitments: string[];
      if (chainCommitments && chainCommitments.length > 0) {
        // Authoritative path. Keep local storage in sync for other views, but
        // do NOT mix it into the tree.
        commitments = chainCommitments;
      } else {
        // The pool predates the get_commitments view. Fall back to event scan
        // + local cache, which may be incomplete on networks with short event
        // retention.
        await syncDepositsFromChain(poolId);
        commitments = getAllCommitments(poolKey);
        if (commitments.length === 0) {
          setStep("idle");
          setStatus(
            "Error: This pool does not expose get_commitments and no deposits " +
              "could be recovered from events. Redeploy the pool (just deploy) " +
              "and re-deposit.",
          );
          setIsLoading(false);
          return;
        }
      }

      const merkle = await buildMerkleTree(commitments, selectedNote.leafIndex);

      if (merkle.root.toLowerCase() !== onChainRoot.toLowerCase()) {
        setStep("idle");
        const usedChain = chainCommitments && chainCommitments.length > 0;
        const detail = usedChain
          ? "Rebuilt from the on-chain commitment list but roots still differ — " +
            "this should not happen; please report it."
          : "Rebuilt from event scan / local cache, which is incomplete on this " +
            "RPC. Redeploy the pool (just deploy) so it exposes get_commitments, " +
            "then re-deposit.";
        setStatus(
          `Error: Merkle root mismatch (${commitments.length} leaves). ${detail}`,
        );
        setIsLoading(false);
        return;
      }

      const recipientAddr = recipient || address;

      // The recipient must be able to receive USDC. For your own wallet we
      // establish the trustline automatically; an external recipient must
      // already have one (we can't sign on their behalf). Check before the
      // expensive proof so we fail fast.
      if (getUsdcSacId()) {
        if (recipientAddr === address) {
          setStatus("Ensuring recipient USDC trustline...");
          await ensureUsdcTrustline(address, signTransaction);
        } else if (!(await hasUsdcTrustline(recipientAddr!))) {
          setStep("idle");
          setStatus(
            `Error: Recipient ${recipientAddr!.slice(0, 8)}… has no USDC trustline. ` +
              "Withdraw to your own address, or have the recipient add a USDC trustline first.",
          );
          setIsLoading(false);
          return;
        }
      }

      setStep("generating_proof");
      const recipientHash = await computeRecipientHash(recipientAddr!);

      let proof: string;
      let publicInputs: string;
      try {
        const result = await proveWithdrawal({
          nullifier: selectedNote.nullifier,
          secret: selectedNote.secret,
          root: onChainRoot,
          nullifierHash: nullifierHash,
          recipientHash,
          pathSiblings: merkle.pathSiblings,
          pathBits: merkle.pathBits,
        });
        proof = result.proof;
        publicInputs = result.publicInputs;
      } catch (proveErr) {
        setStep("idle");
        const msg =
          proveErr instanceof Error ? proveErr.message : String(proveErr);
        setStatus(`Error generating proof: ${msg}`);
        setIsLoading(false);
        return;
      }

      setStep("submitting");

      // Prefer the relayer so the withdrawal is unlinkable — the user's own
      // account never appears on-chain. The recipient binding (enforced by the
      // contract) means the relayer can't redirect the funds. If no relayer is
      // configured, fall back to a wallet-signed submission.
      let txHash: string;
      let viaRelayer = false;
      const relayed = await relayWithdrawal({
        poolId,
        recipient: recipientAddr!,
        publicInputs,
        proof,
      });
      if (relayed) {
        txHash = relayed.hash;
        viaRelayer = true;
      } else {
        setStep("signing");
        const recipientScVal = StellarSdk.nativeToScVal(recipientAddr, {
          type: "address",
        });
        const publicInputsScVal = StellarSdk.xdr.ScVal.scvBytes(
          Buffer.from(publicInputs, "hex"),
        );
        const proofScVal = StellarSdk.xdr.ScVal.scvBytes(
          Buffer.from(proof, "hex"),
        );
        const tx = await buildContractCall(
          poolId,
          "withdraw",
          [recipientScVal, publicInputsScVal, proofScVal],
          address,
        );
        const signedXdr = await signTransaction(tx.toXDR());
        setStep("submitting");
        txHash = await submitTransaction(signedXdr);
      }

      markNoteSpent(selectedNote.commitment);
      setSelectedNote(null);
      setStep("done");
      setStatus(
        `Withdrawal successful${viaRelayer ? " (relayed — unlinkable)" : ""}! TX: ${txHash.slice(0, 12)}...`,
      );
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

  async function handleClearCacheAndResync() {
    const poolId = selectedNote?.poolId || POOL_CONTRACT_ID;
    if (!poolId) {
      setStatus("Error: Pool contract ID not configured.");
      return;
    }

    setIsLoading(true);
    try {
      // Drop this pool's cached deposit records (e.g. stale entries from a
      // previous deployment) and rebuild the set from on-chain events.
      const removed = clearDeposits(poolId);
      setStatus("Cache cleared. Re-syncing deposits from chain...");
      const synced = await syncDepositsFromChain(poolId);
      setStatus(
        `Done: removed ${removed} cached record(s), re-synced ${synced} deposit(s) from chain. Try the withdrawal again.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error clearing cache: ${msg}`);
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

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="mb-3 text-sm font-medium text-zinc-400">
                Recipient Address
              </h3>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.trim())}
                placeholder={address || "G..."}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs text-zinc-300 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
              <p className="mt-2 text-xs text-zinc-600">
                Leave empty to withdraw to your connected wallet. Use a
                different address for unlinkable withdrawals.
              </p>
            </div>

            <button
              onClick={handleAutomatedWithdraw}
              disabled={isLoading}
              className="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Processing..." : "Generate Proof & Withdraw"}
            </button>

            <button
              onClick={handleClearCacheAndResync}
              disabled={isLoading}
              className="w-full rounded-lg border border-zinc-700 py-2.5 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear deposit cache &amp; re-sync from chain
            </button>
            <p className="text-xs text-zinc-600">
              Use this if you hit a Merkle root mismatch — it discards stale
              local deposit records and rebuilds the set from on-chain events.
            </p>
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
