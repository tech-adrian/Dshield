// Computes the recipient hash the withdrawal circuit commits to for a Stellar
// account address, using the same Poseidon2 hasher circuit and byte-split as
// the app (src/lib/poseidon2.ts). Prints the 0x-prefixed field hex to stdout.
//
//   node scripts/recipient-hash.mjs G...ACCOUNT
import { Noir } from "@noir-lang/noir_js";
import { readFileSync } from "fs";
import * as StellarSdk from "@stellar/stellar-sdk";

const recipient = process.argv[2];
if (!recipient || !StellarSdk.StrKey.isValidEd25519PublicKey(recipient)) {
  console.error("usage: node scripts/recipient-hash.mjs <G...account>");
  process.exit(1);
}

const hasher = JSON.parse(
  readFileSync(new URL("../src/circuits/hasher.json", import.meta.url)),
);
const noir = new Noir(hasher);

const raw = StellarSdk.Keypair.fromPublicKey(recipient).rawPublicKey();
const lo = "0x00" + Buffer.from(raw.slice(0, 15)).toString("hex");
const hi = "0x00" + Buffer.from(raw.slice(15)).toString("hex");

const { returnValue } = await noir.execute({ a: lo, b: hi });
process.stdout.write(returnValue);
