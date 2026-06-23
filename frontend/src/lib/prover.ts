import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import poolCircuit from "@/circuits/shielded_pool.json";
import complianceCircuit from "@/circuits/compliance.json";

interface ProofResult {
  proof: string;
  publicInputs: string;
}

async function generateProof(
  circuit: Record<string, unknown>,
  inputs: Record<string, string | string[]>,
): Promise<ProofResult> {
  const noir = new Noir(circuit as never);
  const backend = new UltraHonkBackend(
    (circuit as { bytecode: string }).bytecode,
  );

  try {
    const { witness } = await noir.execute(inputs as never);
    const proof = await backend.generateProof(witness);

    const proofHex = Buffer.from(proof.proof).toString("hex");
    const publicInputsHex = proof.publicInputs
      .map((pi: string) => pi.replace(/^0x/, "").padStart(64, "0"))
      .join("");

    return { proof: proofHex, publicInputs: publicInputsHex };
  } finally {
    await backend.destroy();
  }
}

export async function proveWithdrawal(inputs: {
  nullifier: string;
  secret: string;
  root: string;
  nullifierHash: string;
  recipientHash: string;
  pathSiblings: string[];
  pathBits: number[];
}): Promise<ProofResult> {
  return generateProof(poolCircuit as Record<string, unknown>, {
    nullifier: ensureHex(inputs.nullifier),
    secret: ensureHex(inputs.secret),
    root: ensureHex(inputs.root),
    nullifier_hash: ensureHex(inputs.nullifierHash),
    recipient: ensureHex(inputs.recipientHash),
    path_bits: inputs.pathBits.map(String),
    path_siblings: inputs.pathSiblings.map(ensureHex),
  });
}

export async function proveCompliance(inputs: {
  kycPreimage: string;
  nullifier: string;
  secret: string;
  amount: string;
  auditorKey: string;
  merkleRoot: string;
  kycHash: string;
  disclosedAmount: string;
  pathSiblings: string[];
  pathBits: number[];
}): Promise<ProofResult> {
  return generateProof(complianceCircuit as Record<string, unknown>, {
    kyc_preimage: ensureHex(inputs.kycPreimage),
    nullifier: ensureHex(inputs.nullifier),
    secret: ensureHex(inputs.secret),
    amount: inputs.amount,
    auditor_key: ensureHex(inputs.auditorKey),
    merkle_root: ensureHex(inputs.merkleRoot),
    kyc_hash: ensureHex(inputs.kycHash),
    disclosed_amount: inputs.disclosedAmount,
    path_bits: inputs.pathBits.map(String),
    path_siblings: inputs.pathSiblings.map(ensureHex),
  });
}

function ensureHex(v: string): string {
  if (v.startsWith("0x")) return v;
  return "0x" + v;
}
