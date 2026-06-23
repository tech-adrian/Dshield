import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const PROJECT_ROOT = join(process.cwd(), "..");
const CIRCUIT_DIR = join(PROJECT_ROOT, "circuits", "shielded_pool");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      nullifier,
      secret,
      root,
      nullifierHash,
      recipientHash,
      pathSiblings,
      pathBits,
    } = body;

    if (!nullifier || !secret || !root || !nullifierHash || !recipientHash) {
      return NextResponse.json(
        { error: "Missing required fields" },
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

    const proverToml = `nullifier = "${ensureHex(nullifier)}"
secret = "${ensureHex(secret)}"
root = "${ensureHex(root)}"
nullifier_hash = "${ensureHex(nullifierHash)}"
recipient = "${ensureHex(recipientHash)}"
path_bits = [${bitsToml}]
path_siblings = [
${siblingsToml},
]
`;

    const workDir = join(tmpdir(), `dshield-prove-${Date.now()}`);
    mkdirSync(workDir, { recursive: true });

    const proverPath = join(CIRCUIT_DIR, "Prover.toml");
    const originalProver = readFileSync(proverPath, "utf-8");

    try {
      writeFileSync(proverPath, proverToml);

      execSync("nargo execute", {
        cwd: CIRCUIT_DIR,
        timeout: 60000,
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.nargo/bin:${process.env.HOME}/.bb:${process.env.PATH}`,
        },
      });

      execSync(
        "bb prove --scheme ultra_honk --oracle_hash keccak " +
          "--bytecode_path target/shielded_pool.json " +
          "--witness_path target/shielded_pool.gz " +
          "--output_path target --output_format bytes_and_fields",
        {
          cwd: CIRCUIT_DIR,
          timeout: 120000,
          env: {
            ...process.env,
            PATH: `${process.env.HOME}/.nargo/bin:${process.env.HOME}/.bb:${process.env.PATH}`,
          },
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
    console.error("Proof generation failed:", message);

    if (message.includes("ACIR simulation failed")) {
      return NextResponse.json(
        { error: "Circuit execution failed - inputs may be invalid. Check that the Merkle root and path are correct." },
        { status: 400 },
      );
    }

    if (message.includes("nargo") && message.includes("not found")) {
      return NextResponse.json(
        { error: "nargo CLI not found. Ensure Noir is installed." },
        { status: 500 },
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
