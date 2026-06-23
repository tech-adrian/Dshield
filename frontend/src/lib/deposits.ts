const DEPOSITS_KEY = "dshield_deposits";

export interface DepositRecord {
  commitment: string;
  leafIndex: number;
  timestamp: number;
  poolId?: string;
}

export function saveDeposit(record: DepositRecord): void {
  const deposits = getDeposits();
  if (deposits.some((d) => d.commitment === record.commitment)) return;
  deposits.push(record);
  deposits.sort((a, b) => a.leafIndex - b.leafIndex);
  localStorage.setItem(DEPOSITS_KEY, JSON.stringify(deposits));
}

export function getDeposits(): DepositRecord[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(DEPOSITS_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}

/**
 * Clear cached deposit records. Pass a poolId to clear only that pool's
 * records (e.g. to discard stale entries from a previous deployment); omit it
 * to clear the entire cache. Returns the number of records removed.
 */
export function clearDeposits(poolId?: string): number {
  if (typeof window === "undefined") return 0;
  const deposits = getDeposits();
  if (!poolId) {
    localStorage.removeItem(DEPOSITS_KEY);
    return deposits.length;
  }
  const remaining = deposits.filter((d) => d.poolId !== poolId);
  localStorage.setItem(DEPOSITS_KEY, JSON.stringify(remaining));
  return deposits.length - remaining.length;
}

export function getAllCommitments(poolId?: string): string[] {
  // Scope strictly to the requested pool. A deposit with no poolId is a
  // legacy/stale record (possibly from a previous deployment) and must NOT
  // leak into another pool's tree, or the rebuilt Merkle root will not match
  // the on-chain root.
  const deposits = getDeposits().filter((d) =>
    poolId ? d.poolId === poolId : true,
  );
  const commitments: string[] = [];
  for (const d of deposits) {
    while (commitments.length < d.leafIndex) {
      commitments.push("0x" + "00".repeat(32));
    }
    commitments[d.leafIndex] = d.commitment;
  }
  return commitments;
}
