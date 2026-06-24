"use client";

import { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  POOL_CONTRACT_ID,
  COMPLIANCE_CONTRACT_ID,
  buildContractCall,
  submitTransaction,
  queryContract,
} from "@/lib/stellar";
import { getNotes, type ShieldedNote } from "@/lib/notes";
import { getAllCommitments } from "@/lib/deposits";
import { getKyc, saveKyc, type KycRecord } from "@/lib/kyc";
import { poseidon2Hash, buildMerkleTree } from "@/lib/poseidon2";
import { generateRandomField } from "@/lib/notes";
import {
  syncDepositsFromChain,
  fetchCommitmentsFromChain,
} from "@/lib/indexer";
import { proveCompliance, proveDisclosure } from "@/lib/prover";
import {
  TOKEN_SYMBOL,
  stroopsToUsdc,
  usdcToStroops,
  truncateMiddle,
} from "@/lib/format";
import { PageShell, PageHeader, ConnectGate } from "@/components/ui/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SelectButton } from "@/components/ui/SelectButton";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { ProgressSteps } from "@/components/ui/ProgressSteps";
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

const PROGRESS_STEPS = [
  "registering_kyc",
  "building_tree",
  "generating_proof",
  "signing",
  "submitting",
] as const;

export default function CompliancePage() {
  const { address, signTransaction } = useWallet();
  const [status, setStatus] = useState("");
  const [step, setStep] = useState<ComplianceStep>("idle");
  const [isLoading, setIsLoading] = useState(false);

  const [selectedNote, setSelectedNote] = useState<ShieldedNote | null>(null);
  const [auditorKey, setAuditorKey] = useState("");
  const [disclosedAmount, setDisclosedAmount] = useState("");
  const [disclosureMode, setDisclosureMode] = useState<"exact" | "threshold">(
    "exact",
  );
  const [threshold, setThreshold] = useState("");
  const [kyc, setKyc] = useState<KycRecord | null>(() => getKyc());

  const allNotes =
    typeof window !== "undefined"
      ? getNotes().filter((n) => !n.spent)
      : [];

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

      const res = await fetch("/api/register-kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycHash: kycHashClean }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || `KYC registration failed (${res.status})`);
      }

      const record: KycRecord = {
        preimage,
        hash: kycHashClean,
        registeredOnChain: true,
        createdAt: Date.now(),
      };
      saveKyc(record);
      setKyc(record);

      setStep("idle");
      setStatus(`KYC registered! TX: ${body.hash.slice(0, 12)}...`);
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

    const noteAmount = selectedNote.amount || "0";
    const noteUsdc = stroopsToUsdc(noteAmount);

    if (disclosureMode === "exact") {
      if (!disclosedAmount) {
        setStatus("Error: Enter the amount to disclose.");
        return;
      }
      const disclosedStroops = usdcToStroops(disclosedAmount);
      if (disclosedStroops !== noteAmount) {
        setStatus(
          `Error: Disclosed amount must match the note's amount (${noteUsdc} ${TOKEN_SYMBOL}). ` +
            "The circuit enforces amount == disclosed_amount.",
        );
        return;
      }
    } else {
      if (!threshold) {
        setStatus("Error: Enter a threshold amount.");
        return;
      }
      const thresholdVal = parseFloat(threshold);
      const amountVal = parseFloat(noteUsdc);
      if (isNaN(thresholdVal) || thresholdVal <= 0) {
        setStatus("Error: Threshold must be a positive number.");
        return;
      }
      if (thresholdVal > amountVal) {
        setStatus(
          `Error: Threshold (${threshold} ${TOKEN_SYMBOL}) exceeds note balance (${noteUsdc} ${TOKEN_SYMBOL}). ` +
            "The proof would fail.",
        );
        return;
      }
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
        if (disclosureMode === "exact") {
          const result = await proveCompliance({
            kycPreimage: kyc.preimage,
            nullifier: selectedNote.nullifier,
            secret: selectedNote.secret,
            amount: noteAmount,
            auditorKey,
            merkleRoot: onChainRoot,
            kycHash: "0x" + kyc.hash,
            disclosedAmount: usdcToStroops(disclosedAmount),
            pathSiblings: merkle.pathSiblings,
            pathBits: merkle.pathBits,
          });
          proof = result.proof;
          publicInputs = result.publicInputs;
        } else {
          const result = await proveDisclosure({
            kycPreimage: kyc.preimage,
            nullifier: selectedNote.nullifier,
            secret: selectedNote.secret,
            amount: noteAmount,
            auditorKey,
            merkleRoot: onChainRoot,
            kycHash: "0x" + kyc.hash,
            threshold: usdcToStroops(threshold),
            pathSiblings: merkle.pathSiblings,
            pathBits: merkle.pathBits,
          });
          proof = result.proof;
          publicInputs = result.publicInputs;
        }
      } catch (proveErr) {
        setStep("idle");
        const msg =
          proveErr instanceof Error ? proveErr.message : String(proveErr);
        setStatus(`Error generating proof: ${msg}`);
        setIsLoading(false);
        return;
      }

      const contractMethod =
        disclosureMode === "exact" ? "verify_compliance" : "verify_disclosure";

      setStep("signing");
      const publicInputsScVal = StellarSdk.xdr.ScVal.scvBytes(
        Buffer.from(publicInputs, "hex"),
      );
      const proofScVal = StellarSdk.xdr.ScVal.scvBytes(
        Buffer.from(proof, "hex"),
      );

      const tx = await buildContractCall(
        COMPLIANCE_CONTRACT_ID,
        contractMethod,
        [publicInputsScVal, proofScVal],
        address,
      );

      const signedXdr = await signTransaction(tx.toXDR());

      setStep("submitting");
      const txHash = await submitTransaction(signedXdr);

      setStep("done");
      if (disclosureMode === "exact") {
        setStatus(`Compliance verified! TX: ${txHash.slice(0, 12)}...`);
      } else {
        setStatus(
          `Disclosure verified! Proved balance >= ${threshold} ${TOKEN_SYMBOL} to auditor. TX: ${txHash.slice(0, 12)}...`,
        );
      }
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
      <ConnectGate
        title="Compliance"
        prompt="Connect your wallet to verify compliance."
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Selective Disclosure"
        description="Prove KYC compliance and disclose specific transaction details to an auditor without revealing your full identity or transaction history."
      />

      <div className="mt-8 space-y-6">
        {/* Step 1: KYC Registration */}
        <Card>
          <h3 className="text-sm font-medium text-zinc-400">
            Step 1: KYC Registration
          </h3>
          {kyc?.registeredOnChain ? (
            <div className="mt-3">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <span>KYC Registered</span>
              </div>
              <div className="mt-2 break-all font-mono text-xs text-zinc-500">
                Hash: {truncateMiddle(kyc.hash, 16, 16)}
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <p className="mb-3 text-sm text-zinc-500">
                Generate and register a KYC hash on-chain. A random preimage is
                created and stored locally - only you know it.
              </p>
              <Button
                fullWidth
                variant="outline"
                onClick={handleSetupKyc}
                disabled={isLoading || !COMPLIANCE_CONTRACT_ID}
              >
                {isLoading && step === "registering_kyc"
                  ? "Registering..."
                  : "Register KYC"}
              </Button>
            </div>
          )}
        </Card>

        {/* Step 2: Select Note */}
        <Card>
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
                <SelectButton
                  key={note.commitment}
                  selected={selectedNote?.commitment === note.commitment}
                  onClick={() => {
                    if (!isLoading) {
                      setSelectedNote(note);
                      setDisclosedAmount(stroopsToUsdc(note.amount || "0"));
                    }
                  }}
                  disabled={isLoading}
                  className="w-full border-zinc-800 text-left hover:border-zinc-700"
                >
                  <div className="font-mono text-xs text-zinc-300">
                    {truncateMiddle(note.commitment, 16, 16)}
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-zinc-500">
                    <span>
                      {stroopsToUsdc(note.amount || "0")} {TOKEN_SYMBOL}
                    </span>
                    <span>Leaf #{note.leafIndex}</span>
                  </div>
                </SelectButton>
              ))}
            </div>
          )}
        </Card>

        {/* Step 3: Disclosure Details */}
        {selectedNote && kyc?.registeredOnChain && (
          <Card>
            <h3 className="mb-3 text-sm font-medium text-zinc-400">
              Step 3: Disclosure Details
            </h3>
            <div className="space-y-4">
              {/* Mode toggle */}
              <div>
                <label className="mb-2 block text-xs text-zinc-500">
                  Disclosure Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <SelectButton
                    selected={disclosureMode === "exact"}
                    onClick={() => setDisclosureMode("exact")}
                    disabled={isLoading}
                    className="text-center font-medium"
                  >
                    Exact Amount
                  </SelectButton>
                  <SelectButton
                    selected={disclosureMode === "threshold"}
                    tone="accent"
                    onClick={() => setDisclosureMode("threshold")}
                    disabled={isLoading}
                    className="text-center font-medium"
                  >
                    Balance Threshold
                  </SelectButton>
                </div>
                <p className="mt-2 text-xs text-zinc-600">
                  {disclosureMode === "exact"
                    ? "Reveal the exact amount to the auditor."
                    : "Prove your balance meets a minimum without revealing the exact amount."}
                </p>
              </div>

              {/* Auditor key */}
              <Input
                label="Auditor Key (field element)"
                mono
                value={auditorKey}
                onChange={(e) => setAuditorKey(e.target.value.trim())}
                placeholder="e.g. 42 or 0xabcd..."
                hint="The auditor's public identifier. Binds the proof to this specific auditor."
              />

              {/* Exact mode: disclosed amount */}
              {disclosureMode === "exact" && (
                <Input
                  type="number"
                  label={`Disclosed Amount (${TOKEN_SYMBOL})`}
                  mono
                  value={disclosedAmount}
                  onChange={(e) => setDisclosedAmount(e.target.value.trim())}
                  placeholder="10"
                  step="any"
                  hint={
                    <>
                      Must match the note&apos;s actual amount (
                      {stroopsToUsdc(selectedNote.amount || "0")} {TOKEN_SYMBOL}
                      ). The circuit enforces this equality.
                    </>
                  }
                />
              )}

              {/* Threshold mode: minimum balance */}
              {disclosureMode === "threshold" && (
                <Input
                  type="number"
                  label={`Minimum Balance (${TOKEN_SYMBOL})`}
                  mono
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value.trim())}
                  placeholder={`e.g. ${Number(stroopsToUsdc(selectedNote.amount || "0")) / 2}`}
                  step="any"
                  className="border-brand-800/50 focus-visible:border-brand-500"
                  hint={
                    <>
                      Prove your balance is at least this amount. The auditor
                      learns the threshold was met but not your exact balance.
                      Note balance: {stroopsToUsdc(selectedNote.amount || "0")}{" "}
                      {TOKEN_SYMBOL}.
                    </>
                  }
                />
              )}
            </div>
          </Card>
        )}

        {/* Submit Button */}
        {selectedNote && kyc?.registeredOnChain && (
          <Button
            fullWidth
            size="lg"
            variant={disclosureMode === "threshold" ? "accent" : "primary"}
            onClick={handleVerifyCompliance}
            disabled={
              isLoading ||
              !auditorKey ||
              (disclosureMode === "exact" ? !disclosedAmount : !threshold)
            }
          >
            {isLoading
              ? "Processing..."
              : disclosureMode === "exact"
                ? "Generate Proof & Verify Compliance"
                : "Generate Threshold Proof & Verify"}
          </Button>
        )}

        {/* Progress */}
        {step !== "idle" && step !== "done" && (
          <ProgressSteps
            label={STEP_LABELS[step]}
            steps={PROGRESS_STEPS}
            current={step}
          />
        )}

        {/* Status */}
        {status && (
          <StatusMessage
            message={status}
            successHints={["verified", "registered"]}
          />
        )}
      </div>
    </PageShell>
  );
}
