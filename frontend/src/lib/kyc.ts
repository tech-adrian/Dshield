const KYC_KEY = "dshield_kyc";

export interface KycRecord {
  preimage: string;
  hash: string;
  registeredOnChain: boolean;
  createdAt: number;
}

export function saveKyc(record: KycRecord): void {
  localStorage.setItem(KYC_KEY, JSON.stringify(record));
}

export function getKyc(): KycRecord | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KYC_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

export function clearKyc(): void {
  localStorage.removeItem(KYC_KEY);
}
