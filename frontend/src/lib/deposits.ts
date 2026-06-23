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

export function getAllCommitments(poolId?: string): string[] {
  const deposits = getDeposits().filter(
    (d) => !poolId || !d.poolId || d.poolId === poolId,
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
