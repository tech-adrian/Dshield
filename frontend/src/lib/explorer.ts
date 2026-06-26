import { getNetworkPassphrase } from "./stellar";

// Block-explorer links for the compliance report. On pubnet we use
// stellarchain.io (the explorer the project links to); on testnet we use
// stellar.expert's testnet explorer, which reliably serves testnet history so
// the report's deposit/withdraw links resolve while developing.
const TESTNET = "Test SDF Network ; September 2015";

export function getNetworkLabel(): string {
  const pass = getNetworkPassphrase();
  if (pass === TESTNET) return "Testnet";
  if (pass.startsWith("Public")) return "Mainnet";
  return "Local / Standalone";
}

function isPubnet(): boolean {
  return getNetworkPassphrase().startsWith("Public");
}

/** Explorer URL for a transaction hash, or null on networks without an explorer (local). */
export function explorerTxUrl(hash: string): string | null {
  if (!hash) return null;
  if (isPubnet()) return `https://stellarchain.io/transaction/${hash}`;
  if (getNetworkPassphrase() === TESTNET) {
    return `https://stellar.expert/explorer/testnet/tx/${hash}`;
  }
  return null;
}

/** Explorer URL for a contract id, or null on networks without an explorer (local). */
export function explorerContractUrl(id: string): string | null {
  if (!id) return null;
  if (isPubnet()) return `https://stellarchain.io/contract/${id}`;
  if (getNetworkPassphrase() === TESTNET) {
    return `https://stellar.expert/explorer/testnet/contract/${id}`;
  }
  return null;
}
