"use client";

import { useState, useEffect, useReducer } from "react";
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
import {
  getActiveNotes,
  markNoteSpent,
  parseNote,
  saveNoteIfNew,
  type ShieldedNote,
} from "@/lib/notes";
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
import { friendlyError } from "@/lib/errors";
import { syncSpentNotes } from "@/lib/sync";
import { truncateMiddle } from "@/lib/format";
import { PageShell, PageHeader, ConnectGate } from "@/components/ui/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SelectButton } from "@/components/ui/SelectButton";
import { ProgressSteps } from "@/components/ui/ProgressSteps";
import { NoteImport } from "@/components/ui/NoteImport";
import { useToast } from "@/components/ui/Toast";
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

const PROGRESS_STEPS = [
  "checking_nullifier",
  "building_tree",
  "generating_proof",
  "signing",
  "submitting",
] as const;

export default function WithdrawPage() {
  const { address, signTransaction } = useWallet();
  const { toast } = useToast();
  const [step, setStep] = useState<WithdrawStep>("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedNote, setSelectedNote] = useState<ShieldedNote | null>(null);
  const [recipient, setRecipient] = useState("");
  const [, refresh] = useReducer((x: number) => x + 1, 0);

  // Import a shared note from the URL hash on mount. setSelectedNote here is a
  // legitimate one-time init from an external source (the link), matching the
  // mount-time pattern used elsewhere in the app.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#note=")) return;
    const note = parseNote(decodeURIComponent(hash.slice("#note=".length)));
    if (!note) return;
    saveNoteIfNew(note);
    setSelectedNote(note);
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    syncSpentNotes().then((n) => {
      if (n > 0) refresh();
    });
  }, []);

  const activeNotes = typeof window !== "undefined" ? getActiveNotes() : [];

  async function handleAutomatedWithdraw() {
    if (!address || !selectedNote) return;
    const poolId = selectedNote.poolId || POOL_CONTRACT_ID;
    if (!poolId) {
      toast("Pool address is missing — please refresh the page and try again.", "error");
      return;
    }

    setIsLoading(true);

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
        toast("This note has already been withdrawn — each note can only be spent once.", "error");
        setIsLoading(false);
        return;
      }

      setStep("building_tree");
      const rootVal = await queryContract(poolId, "get_root");
      if (!rootVal) {
        setStep("idle");
        toast("No deposits found in this pool yet. Make a deposit first, then try withdrawing.", "error");
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
      toast("Loading deposit history from the blockchain…");
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
          toast(
            "Couldn't load deposit history for this pool. Try clearing the cache below, or contact support.",
            "error",
          );
          setIsLoading(false);
          return;
        }
      }

      const merkle = await buildMerkleTree(commitments, selectedNote.leafIndex);

      if (merkle.root.toLowerCase() !== onChainRoot.toLowerCase()) {
        setStep("idle");
        const usedChain = chainCommitments && chainCommitments.length > 0;
        toast(
          usedChain
            ? "Deposit verification failed unexpectedly. Please report this along with your commitment hash."
            : "Deposit history couldn't be fully loaded. Try 'Clear deposit cache & re-sync' below, then retry.",
          "error",
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
          toast("Setting up your USDC account…");
          await ensureUsdcTrustline(address, signTransaction);
        } else if (!(await hasUsdcTrustline(recipientAddr!))) {
          setStep("idle");
          toast(
            `The recipient (${recipientAddr!.slice(0, 8)}…) can't receive USDC yet. Ask them to add a USDC trustline, or withdraw to your own address.`,
            "error",
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
        toast(
          `Proof generation failed — ${friendlyError(proveErr)} Try again, or re-deposit if this persists.`,
          "error",
        );
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
      toast(
        viaRelayer
          ? `Withdrawn privately via relayer. Funds are on the way! TX: ${txHash.slice(0, 12)}…`
          : `Withdrawal complete! Funds sent. TX: ${txHash.slice(0, 12)}…`,
        "success",
      );
    } catch (err) {
      setStep("idle");
      console.error("Withdrawal error:", err);
      toast(friendlyError(err), "error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleClearCacheAndResync() {
    const poolId = selectedNote?.poolId || POOL_CONTRACT_ID;
    if (!poolId) {
      toast("Pool address is missing — please refresh the page and try again.", "error");
      return;
    }

    setIsLoading(true);
    try {
      // Drop this pool's cached deposit records (e.g. stale entries from a
      // previous deployment) and rebuild the set from on-chain events.
      clearDeposits(poolId);
      toast("Cache cleared — reloading deposits from the blockchain…");
      const synced = await syncDepositsFromChain(poolId);
      toast(
        `Cache refreshed — found ${synced} deposit${synced !== 1 ? "s" : ""}. Try withdrawing again.`,
        "success",
      );
    } catch (err) {
      toast(`Couldn't clear the cache — ${friendlyError(err)}`, "error");
    } finally {
      setIsLoading(false);
    }
  }

  if (!address) {
    return (
      <ConnectGate title="Withdraw" prompt="Connect your wallet to withdraw." />
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Withdraw from Shielded Pool"
        description="Prove you own a note in the Merkle tree without revealing which one. The ZK proof is generated automatically."
      />

      <div className="mt-8 space-y-6">
        <Card>
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
                <SelectButton
                  key={note.commitment}
                  selected={selectedNote?.commitment === note.commitment}
                  onClick={() => !isLoading && setSelectedNote(note)}
                  disabled={isLoading}
                  className="w-full border-zinc-800 text-left hover:border-zinc-700"
                >
                  <div className="font-mono text-xs text-zinc-300">
                    {truncateMiddle(note.commitment, 16, 16)}
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-zinc-500">
                    <span>
                      Created {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                    <span>Leaf #{note.leafIndex}</span>
                  </div>
                </SelectButton>
              ))}
            </div>
          )}
        </Card>

        <NoteImport
          disabled={isLoading}
          onImport={(note) => {
            saveNoteIfNew(note);
            setSelectedNote(note);
          }}
        />

        {selectedNote && (
          <>
            <Card>
              <h3 className="mb-3 text-sm font-medium text-zinc-400">
                Note Details
              </h3>
              <div className="space-y-2 font-mono text-xs">
                <div>
                  <span className="text-zinc-500">Nullifier: </span>
                  <span className="break-all text-zinc-300">
                    {selectedNote.nullifier}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Secret: </span>
                  <span className="break-all text-zinc-300">
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
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-medium text-zinc-400">
                Recipient Address
              </h3>
              <Input
                type="text"
                mono
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.trim())}
                placeholder={address || "G..."}
                hint="Leave empty to withdraw to your connected wallet. Use a different address for unlinkable withdrawals."
              />
            </Card>

            <Button
              fullWidth
              size="lg"
              onClick={handleAutomatedWithdraw}
              disabled={isLoading}
            >
              {isLoading ? "Processing..." : "Generate Proof & Withdraw"}
            </Button>

            <Button
              fullWidth
              variant="outline"
              onClick={handleClearCacheAndResync}
              disabled={isLoading}
              className="text-xs text-zinc-400"
            >
              Clear deposit cache &amp; re-sync from chain
            </Button>
            <p className="text-xs text-zinc-600">
              Use this if you hit a Merkle root mismatch — it discards stale
              local deposit records and rebuilds the set from on-chain events.
            </p>
          </>
        )}

        {step !== "idle" && step !== "done" && (
          <ProgressSteps
            label={STEP_LABELS[step]}
            steps={PROGRESS_STEPS}
            current={step}
          />
        )}

      </div>
    </PageShell>
  );
}
