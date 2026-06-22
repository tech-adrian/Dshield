import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

const PROJECT_ROOT = join(process.cwd(), "..");
const CIRCUIT_DIR = join(PROJECT_ROOT, "circuits", "compliance");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      kycPreimage,
      nullifier,
      secret,
      amount,
      auditorKey,
      merkleRoot,
      kycHash,
      disclosedAmount,
      pathSiblings,
      pathBits,
    } = body;

    if (!kycPreimage || !nullifier || !secret || !merkleRoot || !kycHash) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (!amount || !auditorKey || !disclosedAmount) {
      return NextResponse.json(
        { error: "Missing amount, auditorKey, or disclosedAmount" },
        { status: 400 },
      );
    }

    if (!pathSiblings || pathSiblings.length !== 20) {
      return NextResponse.json(
        { error: "pathSiblings must have exactly 20 elements" },
        { status: 400 },
      );
    }

    if (!pathBits || pathBits.length !== 20) {
      return NextResponse.json(
        { error: "pathBits must have exactly 20 elements" },
        { status: 400 },
      );
    }

    const siblingsToml = pathSiblings
      .map((s: string) => `    "${ensureHex(s)}"`)
      .join(",\n");

    const bitsToml = pathBits.join(", ");

    const proverToml = `kyc_preimage = "${ensureHex(kycPreimage)}"
nullifier = "${ensureHex(nullifier)}"
secret = "${ensureHex(secret)}"
amount = "${amount}"
auditor_key = "${ensureHex(auditorKey)}"
merkle_root = "${ensureHex(merkleRoot)}"
kyc_hash = "${ensureHex(kycHash)}"
disclosed_amount = "${disclosedAmount}"
path_bits = [${bitsToml}]
path_siblings = [
${siblingsToml},
]
`;

    const proverPath = join(CIRCUIT_DIR, "Prover.toml");
    const originalProver = readFileSync(proverPath, "utf-8");

    try {
      writeFileSync(proverPath, proverToml);

      const envWithPath = {
        ...process.env,
        PATH: `${process.env.HOME}/.nargo/bin:${process.env.HOME}/.bb:${process.env.PATH}`,
      };

      execSync("nargo execute", {
        cwd: CIRCUIT_DIR,
        timeout: 60000,
        env: envWithPath,
      });

      execSync(
        "bb prove --scheme ultra_honk --oracle_hash keccak " +
          "--bytecode_path target/compliance.json " +
          "--witness_path target/compliance.gz " +
          "--output_path target --output_format bytes_and_fields",
        {
          cwd: CIRCUIT_DIR,
          timeout: 120000,
          env: envWithPath,
        },
      );

      const proofBytes = readFileSync(join(CIRCUIT_DIR, "target", "proof"));
      const publicInputsBytes = readFileSync(
        join(CIRCUIT_DIR, "target", "public_inputs"),
      );

      return NextResponse.json({
        proof: proofBytes.toString("hex"),
        publicInputs: publicInputsBytes.toString("hex"),
      });
    } finally {
      writeFileSync(proverPath, originalProver);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Compliance proof generation failed:", message);

    if (message.includes("Cannot satisfy constraint")) {
      return NextResponse.json(
        {
          error:
            "Circuit constraints not satisfied. Possible causes: " +
            "KYC hash doesn't match preimage, " +
            "Merkle root mismatch, " +
            "or disclosed amount doesn't match actual amount.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: `Proof generation failed: ${message}` },
      { status: 500 },
    );
  }
}

function ensureHex(v: string): string {
  if (v.startsWith("0x")) return v;
  return "0x" + v;
}
