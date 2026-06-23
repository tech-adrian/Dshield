import * as StellarSdk from "@stellar/stellar-sdk";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8000/soroban/rpc";
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "Standalone Network ; February 2017";
const DEV_SECRET_KEY = process.env.NEXT_PUBLIC_DEV_SECRET_KEY || "";

export const POOL_CONTRACT_ID = process.env.NEXT_PUBLIC_POOL_CONTRACT_ID || "";
export const COMPLIANCE_CONTRACT_ID = process.env.NEXT_PUBLIC_COMPLIANCE_CONTRACT_ID || "";

export interface PoolTier {
  id: string;
  label: string;
  amount: number;
}

export function getPoolTiers(): PoolTier[] {
  const tiers: PoolTier[] = [];
  const raw = process.env.NEXT_PUBLIC_POOL_TIERS || "";
  if (raw) {
    for (const entry of raw.split(",")) {
      const [label, id, amt] = entry.split(":");
      if (label && id && amt) {
        tiers.push({ id, label, amount: Number(amt) });
      }
    }
  }
  if (tiers.length === 0 && POOL_CONTRACT_ID) {
    tiers.push({ id: POOL_CONTRACT_ID, label: "10 USDC", amount: 100000000 });
  }
  return tiers;
}

export function getRpcServer() {
  return new StellarSdk.rpc.Server(RPC_URL, { allowHttp: true });
}

export function getNetworkPassphrase() {
  return NETWORK_PASSPHRASE;
}

export function getDevKeypair(): StellarSdk.Keypair | null {
  if (!DEV_SECRET_KEY) return null;
  return StellarSdk.Keypair.fromSecret(DEV_SECRET_KEY);
}

export function devSignTransaction(xdr: string): string {
  const keypair = getDevKeypair();
  if (!keypair) throw new Error("No dev secret key configured");
  const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
  tx.sign(keypair);
  return tx.toXDR();
}

export async function buildContractCall(
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[],
  publicKey: string,
): Promise<StellarSdk.Transaction> {
  const server = getRpcServer();
  const account = await server.getAccount(publicKey);
  const contract = new StellarSdk.Contract(contractId);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed: ${simulated.error}`);
  }
  return StellarSdk.rpc.assembleTransaction(tx, simulated).build();
}

export async function submitTransaction(signedXdr: string): Promise<string> {
  const server = getRpcServer();
  const tx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, getNetworkPassphrase());
  const response = await server.sendTransaction(tx);

  if (response.status === "ERROR") {
    throw new Error(`Transaction failed: ${response.status}`);
  }

  let result = await server.getTransaction(response.hash);
  while (result.status === "NOT_FOUND") {
    await new Promise((r) => setTimeout(r, 1000));
    result = await server.getTransaction(response.hash);
  }

  if (result.status === "FAILED") {
    throw new Error("Transaction failed on-chain");
  }

  return response.hash;
}

export function bytesToScVal(hex: string): StellarSdk.xdr.ScVal {
  const bytes = Buffer.from(hex, "hex");
  return StellarSdk.xdr.ScVal.scvBytes(bytes);
}

export async function queryContract(
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[] = [],
): Promise<StellarSdk.xdr.ScVal | null> {
  const server = getRpcServer();
  const contract = new StellarSdk.Contract(contractId);

  const account = new StellarSdk.Account(
    "GA5WUJ54Z23KILLCUOUNAKTPBVZWKMQVO4O6EQ5GHLAERIMLLHNCSKYH",
    "0",
  );

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
    return null;
  }
  if (!StellarSdk.rpc.Api.isSimulationSuccess(simulated)) {
    return null;
  }
  return simulated.result?.retval ?? null;
}
