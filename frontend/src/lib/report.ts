import * as StellarSdk from "@stellar/stellar-sdk";
import { POOL_CONTRACT_ID, queryContract } from "./stellar";
import { computeCommitment, computeNullifierHash } from "./poseidon2";
import { fetchCommitmentsFromChain, lookupNoteTxs } from "./indexer";
import { type ShieldedNote } from "./notes";
import { getNetworkLabel } from "./explorer";

export interface ComplianceReport {
  network: string;
  poolId: string;
  /** 0x-prefixed 32-byte commitment, recomputed from the note. */
  commitment: string;
  /** 0x-prefixed 32-byte nullifier hash, derived from the note. */
  nullifierHash: string;
  /** Whether the commitment recomputed from the note matches the note's stored commitment. */
  integrityOk: boolean;
  /** The commitment was found in the pool's on-chain commitment list. */
  depositConfirmed: boolean;
  /** Leaf index of the commitment on-chain, or null if not found. */
  leafIndex: number | null;
  /** The nullifier has been spent on-chain (funds withdrawn). */
  withdrawn: boolean;
  depositTx: { hash: string; at: string } | null;
  withdrawTx: { hash: string; at: string } | null;
  generatedAt: number;
}

/**
 * Build a compliance report for a note from authoritative on-chain data.
 * Deliberately omits amounts, addresses, AND the note itself (nullifier +
 * secret): the note is a bearer-spendable credential, so embedding it in a
 * report meant to be shared with a third party (an auditor, a PDF export)
 * would hand them the ability to withdraw the funds. Reproducing this report
 * requires the note out of band, from the holder directly.
 */
export async function buildComplianceReport(
  note: ShieldedNote,
): Promise<ComplianceReport> {
  const poolId = note.poolId || POOL_CONTRACT_ID;
  if (!poolId) throw new Error("No pool configured for this note.");

  // Re-derive the commitment and nullifier hash from the note's secrets.
  const commitment = await computeCommitment(note.nullifier, note.secret);
  const nullifierHash = await computeNullifierHash(note.nullifier);
  const commitmentClean = commitment.replace(/^0x/, "").toLowerCase();
  const integrityOk =
    commitmentClean === note.commitment.replace(/^0x/, "").toLowerCase();

  // Deposit confirmation: is the commitment in the pool's authoritative list?
  const chainCommitments = await fetchCommitmentsFromChain(poolId);
  let leafIndex: number | null = null;
  if (chainCommitments) {
    const idx = chainCommitments.findIndex(
      (c) => c.replace(/^0x/, "").toLowerCase() === commitmentClean,
    );
    if (idx >= 0) leafIndex = idx;
  }
  const depositConfirmed = leafIndex !== null;

  // Withdrawal status: has the nullifier been spent on-chain?
  let withdrawn = false;
  const usedVal = await queryContract(poolId, "is_nullifier_used", [
    StellarSdk.xdr.ScVal.scvBytes(
      Buffer.from(nullifierHash.replace(/^0x/, ""), "hex"),
    ),
  ]);
  if (usedVal) withdrawn = StellarSdk.scValToNative(usedVal) === true;

  // Best-effort: link the actual deposit/withdraw transactions.
  const txs = await lookupNoteTxs(poolId, commitment, nullifierHash);

  return {
    network: getNetworkLabel(),
    poolId,
    commitment,
    nullifierHash,
    integrityOk,
    depositConfirmed,
    leafIndex,
    withdrawn,
    depositTx: txs.depositTx,
    withdrawTx: txs.withdrawTx,
    generatedAt: Date.now(),
  };
}

/** Render a report as plain text for download / inspection. */
export function formatReportText(r: ComplianceReport): string {
  const line = (k: string, v: string) => `${k.padEnd(20)}${v}`;
  return [
    "DShield Compliance Report",
    "=========================",
    line("Generated", new Date(r.generatedAt).toISOString()),
    line("Network", r.network),
    line("Pool contract", r.poolId),
    "",
    line("Note integrity", r.integrityOk ? "OK (commitment matches)" : "MISMATCH"),
    line(
      "Deposit",
      r.depositConfirmed
        ? `Confirmed on-chain (leaf #${r.leafIndex})`
        : "Not found on-chain",
    ),
    line("Status", r.withdrawn ? "Withdrawn (nullifier spent)" : "In pool (unspent)"),
    line("Commitment", r.commitment),
    line("Nullifier hash", r.nullifierHash),
    r.depositTx
      ? line("Deposit tx", `${r.depositTx.hash} (${r.depositTx.at})`)
      : line("Deposit tx", "n/a (outside event retention)"),
    r.withdrawTx
      ? line("Withdraw tx", `${r.withdrawTx.hash} (${r.withdrawTx.at})`)
      : line("Withdraw tx", r.withdrawn ? "n/a (outside event retention)" : "—"),
  ].join("\n");
}
