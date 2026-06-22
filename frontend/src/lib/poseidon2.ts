import { Noir } from "@noir-lang/noir_js";
import hasherCircuit from "@/circuits/hasher.json";

let noirInstance: InstanceType<typeof Noir> | null = null;

async function getHasher(): Promise<InstanceType<typeof Noir>> {
  if (!noirInstance) {
    noirInstance = new Noir(hasherCircuit as never);
  }
  return noirInstance;
}

export async function poseidon2Hash(a: string, b: string): Promise<string> {
  const noir = await getHasher();
  const result = await noir.execute({ a, b });
  return result.returnValue as string;
}

export async function computeCommitment(
  nullifier: string,
  secret: string,
): Promise<string> {
  return poseidon2Hash(toField(nullifier), toField(secret));
}

export async function computeNullifierHash(
  nullifier: string,
): Promise<string> {
  return poseidon2Hash(toField(nullifier), "0");
}

function toField(hex: string): string {
  if (hex.startsWith("0x")) return hex;
  return "0x" + hex;
}

const TREE_DEPTH = 20;

let zeroHashesCache: string[] | null = null;

export async function getZeroHashes(): Promise<string[]> {
  if (zeroHashesCache) return zeroHashesCache;
  const zeroes: string[] = [];
  let cur = "0x" + "00".repeat(32);
  zeroes.push(cur);
  for (let i = 0; i < TREE_DEPTH; i++) {
    cur = await poseidon2Hash(cur, cur);
    zeroes.push(cur);
  }
  zeroHashesCache = zeroes;
  return zeroes;
}

export interface MerkleProof {
  root: string;
  pathSiblings: string[];
  pathBits: number[];
}

export async function buildMerkleTree(
  commitments: string[],
  targetIndex: number,
): Promise<MerkleProof> {
  const zeroes = await getZeroHashes();
  const n = commitments.length;

  const leaves: string[] = [];
  for (let i = 0; i < Math.max(n, targetIndex + 1); i++) {
    leaves.push(i < n ? ensureHex(commitments[i]) : zeroes[0]);
  }

  let currentLevel = leaves;
  const pathSiblings: string[] = [];
  const pathBits: number[] = [];
  let targetIdx = targetIndex;

  for (let depth = 0; depth < TREE_DEPTH; depth++) {
    const bit = targetIdx & 1;
    pathBits.push(bit);

    const siblingIdx = targetIdx ^ 1;
    if (siblingIdx < currentLevel.length) {
      pathSiblings.push(currentLevel[siblingIdx]);
    } else {
      pathSiblings.push(zeroes[depth]);
    }

    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : zeroes[depth];
      nextLevel.push(await poseidon2Hash(left, right));
    }

    if (nextLevel.length === 0) {
      nextLevel.push(zeroes[depth + 1]);
    }

    currentLevel = nextLevel;
    targetIdx = targetIdx >> 1;
  }

  return {
    root: currentLevel[0],
    pathSiblings,
    pathBits,
  };
}

function ensureHex(v: string): string {
  if (v.startsWith("0x")) return v;
  return "0x" + v;
}
