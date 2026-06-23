"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  buildContractCall,
  submitTransaction,
  queryContract,
  POOL_CONTRACT_ID,
  COMPLIANCE_CONTRACT_ID,
} from "@/lib/stellar";
import { getNotes, type ShieldedNote } from "@/lib/notes";
import { getAllCommitments } from "@/lib/deposits";
import { getKyc, saveKyc, type KycRecord } from "@/lib/kyc";
import {
  poseidon2Hash,
  computeNullifierHash,
  buildMerkleTree,
} from "@/lib/poseidon2";
import { generateRandomField } from "@/lib/notes";
import {
  syncDepositsFromChain,
  fetchCommitmentsFromChain,
} from "@/lib/indexer";
import { proveCompliance } from "@/lib/prover";
import * as StellarSdk from "@stellar/stellar-sdk";

type ComplianceStep =
  | "idle"
  | "registering_kyc"
  | "building_tree"
  | "generating_proof"
  | "signing"
  | "submitting"
  | "done";

const STEP_LABELS: Record<ComplianceStep, string> = {
  idle: "",
  registering_kyc: "Registering KYC on-chain...",
  building_tree: "Building Merkle tree...",
  generating_proof: "Generating compliance proof (this may take a minute)...",
  signing: "Signing transaction...",
  submitting: "Submitting transaction...",
  done: "Compliance verified!",
};

export default function CompliancePage() {
  const { address, signTransaction } = useWallet();
  const [status, setStatus] = useState("");
  const [step, setStep] = useState<ComplianceStep>("idle");
  const [isLoading, setIsLoading] = useState(false);

  const [selectedNote, setSelectedNote] = useState<ShieldedNote | null>(null);
  const [auditorKey, setAuditorKey] = useState("");
  const [disclosedAmount, setDisclosedAmount] = useState("");
  const [kyc, setKyc] = useState<KycRecord | null>(null);

  const allNotes =
    typeof window !== "undefined"
      ? getNotes().filter((n) => !n.spent)
      : [];

  useEffect(() => {
    setKyc(getKyc());
  }, []);

  async function handleSetupKyc() {
    if (!address || !COMPLIANCE_CONTRACT_ID) return;
    setIsLoading(true);
    setStatus("");

    try {
      setStep("registering_kyc");

      const preimage = generateRandomField();
      const kycHash = await poseidon2Hash(
        preimage.startsWith("0x") ? preimage : "0x" + preimage,
        "0",
      );
      const kycHashClean = kycHash.replace(/^0x/, "");

      const kycHashScVal = StellarSdk.xdr.ScVal.scvBytes(
        Buffer.from(kycHashClean, "hex"),
      );

      const tx = await buildContractCall(
        COMPLIANCE_CONTRACT_ID,
        "register_kyc",
        [kycHashScVal],
        address,
      );

      const signedXdr = await signTransaction(tx.toXDR());
      const txHash = await submitTransaction(signedXdr);

      const record: KycRecord = {
        preimage,
        hash: kycHashClean,
        registeredOnChain: true,
        createdAt: Date.now(),
      };
      saveKyc(record);
      setKyc(record);

      setStep("idle");
      setStatus(`KYC registered! TX: ${txHash.slice(0, 12)}...`);
    } catch (err) {
      setStep("idle");
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("KYC registration error:", err);
      setStatus(`Error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyCompliance() {
    if (!address || !selectedNote || !kyc) return;
    if (!POOL_CONTRACT_ID || !COMPLIANCE_CONTRACT_ID) {
      setStatus("Error: Contract IDs not configured.");
      return;
    }
    if (!auditorKey) {
      setStatus("Error: Enter an auditor key.");
      return;
    }
    if (!disclosedAmount) {
      setStatus("Error: Enter the amount to disclose.");
      return;
    }

    const noteAmount = selectedNote.amount || "0";
    if (disclosedAmount !== noteAmount) {
      setStatus(
        `Error: Disclosed amount must match the note's amount (${noteAmount}). ` +
          "The circuit enforces amount == disclosed_amount.",
      );
      return;
    }

    setIsLoading(true);
    setStatus("");

    try {
      setStep("building_tree");

      const isRegistered = await queryContract(
        COMPLIANCE_CONTRACT_ID,
        "is_kyc_registered",
        [
          StellarSdk.xdr.ScVal.scvBytes(
            Buffer.from(kyc.hash, "hex"),
          ),
        ],
      );
      if (!isRegistered || StellarSdk.scValToNative(isRegistered) !== true) {
        setStep("idle");
        setStatus("Error: KYC hash is not registered on-chain. Register first.");
        setIsLoading(false);
        return;
      }

      const compliancePoolId = selectedNote.poolId || POOL_CONTRACT_ID;
      const rootVal = await queryContract(compliancePoolId, "get_root");
      if (!rootVal) {
        setStep("idle");
        setStatus("Error: No Merkle root found. Has any deposit been made?");
        setIsLoading(false);
        return;
      }
      const rootBytes = StellarSdk.scValToNative(rootVal) as Buffer;
      const onChainRoot = "0x" + Buffer.from(rootBytes).toString("hex");

      // Rebuild the tree from the authoritative on-chain commitment list
      // (get_commitments) — the same retention-independent path the withdraw
      // flow uses. Fall back to event scan + local cache only for older pools
      // that predate the get_commitments view.
      const poolKey = selectedNote.poolId || POOL_CONTRACT_ID;
      const chainCommitments = await fetchCommitmentsFromChain(compliancePoolId);
      let commitments: string[];
      if (chainCommitments && chainCommitments.length > 0) {
        commitments = chainCommitments;
      } else {
        await syncDepositsFromChain(compliancePoolId);
        commitments = getAllCommitments(poolKey);
        if (commitments.length === 0) {
          setStep("idle");
          setStatus("Error: No deposits found on-chain or locally.");
          setIsLoading(false);
          return;
        }
      }

      const merkle = await buildMerkleTree(commitments, selectedNote.leafIndex);

      if (merkle.root.toLowerCase() !== onChainRoot.toLowerCase()) {
        setStep("idle");
        setStatus(
          `Error: Merkle root mismatch (${commitments.length} leaves). ` +
            "If this pool predates the get_commitments upgrade, redeploy and re-deposit.",
        );
        setIsLoading(false);
        return;
      }

      setStep("generating_proof");

      let proof: string;
      let publicInputs: string;
      try {
        const result = await proveCompliance({
          kycPreimage: kyc.preimage,
          nullifier: selectedNote.nullifier,
          secret: selectedNote.secret,
          amount: noteAmount,
          auditorKey,
          merkleRoot: onChainRoot,
          kycHash: "0x" + kyc.hash,
          disclosedAmount,
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

      setStep("signing");
      const publicInputsScVal = StellarSdk.xdr.ScVal.scvBytes(
        Buffer.from(publicInputs, "hex"),
      );
      const proofScVal = StellarSdk.xdr.ScVal.scvBytes(
        Buffer.from(proof, "hex"),
      );

      const tx = await buildContractCall(
        COMPLIANCE_CONTRACT_ID,
        "verify_compliance",
        [publicInputsScVal, proofScVal],
        address,
      );

      const signedXdr = await signTransaction(tx.toXDR());

      setStep("submitting");
      const txHash = await submitTransaction(signedXdr);

      setStep("done");
      setStatus(`Compliance verified! TX: ${txHash.slice(0, 12)}...`);
    } catch (err) {
      setStep("idle");
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("Compliance error:", err);
      setStatus(`Error: ${msg}`);
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
        {/* Step 1: KYC Registration */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="text-sm font-medium text-zinc-400">
            Step 1: KYC Registration
          </h3>
          {kyc?.registeredOnChain ? (
            <div className="mt-3">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <span>KYC Registered</span>
              </div>
              <div className="mt-2 text-xs font-mono text-zinc-500 break-all">
                Hash: {kyc.hash.slice(0, 16)}...{kyc.hash.slice(-16)}
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-zinc-500 mb-3">
                Generate and register a KYC hash on-chain. A random preimage is
                created and stored locally - only you know it.
              </p>
              <button
                onClick={handleSetupKyc}
                disabled={isLoading || !COMPLIANCE_CONTRACT_ID}
                className="w-full rounded-lg bg-zinc-700 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading && step === "registering_kyc"
                  ? "Registering..."
                  : "Register KYC"}
              </button>
            </div>
          )}
        </div>

        {/* Step 2: Select Note */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="text-sm font-medium text-zinc-400">
            Step 2: Select a Note ({allNotes.length} available)
          </h3>
          {allNotes.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              No active notes. Deposit funds first.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {allNotes.map((note) => (
                <button
                  key={note.commitment}
                  onClick={() => {
                    if (!isLoading) {
                      setSelectedNote(note);
                      setDisclosedAmount(note.amount || "0");
                    }
                  }}
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
                    <span>Amount: {note.amount || "N/A"}</span>
                    <span>Leaf #{note.leafIndex}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 3: Disclosure Details */}
        {selectedNote && kyc?.registeredOnChain && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <h3 className="mb-3 text-sm font-medium text-zinc-400">
              Step 3: Disclosure Details
            </h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Auditor Key (field element)
                </label>
                <input
                  type="text"
                  value={auditorKey}
                  onChange={(e) => setAuditorKey(e.target.value.trim())}
                  placeholder="e.g. 42 or 0xabcd..."
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs text-zinc-300 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-zinc-600">
                  The auditor&apos;s public identifier. Binds the proof to this
                  specific auditor.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Disclosed Amount
                </label>
                <input
                  type="text"
                  value={disclosedAmount}
                  onChange={(e) => setDisclosedAmount(e.target.value.trim())}
                  placeholder="1000000"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs text-zinc-300 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-zinc-600">
                  Must match the note&apos;s actual amount ({selectedNote.amount || "N/A"}).
                  The circuit enforces this equality.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        {selectedNote && kyc?.registeredOnChain && (
          <button
            onClick={handleVerifyCompliance}
            disabled={isLoading || !auditorKey || !disclosedAmount}
            className="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Processing..." : "Generate Proof & Verify Compliance"}
          </button>
        )}

        {/* Progress */}
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
                  "registering_kyc",
                  "building_tree",
                  "generating_proof",
                  "signing",
                  "submitting",
                ] as ComplianceStep[]
              ).map((s, i) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full ${
                    stepIndex(step) >= i ? "bg-white" : "bg-zinc-700"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        {status && (
          <div
            className={`rounded-lg p-3 text-sm ${
              status.startsWith("Error")
                ? "bg-red-900/30 text-red-400"
                : status.includes("verified") || status.includes("registered")
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

function stepIndex(s: ComplianceStep): number {
  const order: ComplianceStep[] = [
    "registering_kyc",
    "building_tree",
    "generating_proof",
    "signing",
    "submitting",
  ];
  return order.indexOf(s);
}
