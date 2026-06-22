import * as StellarSdk from "@stellar/stellar-sdk";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8000/soroban/rpc";
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "Standalone Network ; February 2017";

export const POOL_CONTRACT_ID = process.env.NEXT_PUBLIC_POOL_CONTRACT_ID || "";
export const COMPLIANCE_CONTRACT_ID = process.env.NEXT_PUBLIC_COMPLIANCE_CONTRACT_ID || "";

export function getRpcServer() {
  return new StellarSdk.rpc.Server(RPC_URL);
}

export function getNetworkPassphrase() {
  return NETWORK_PASSPHRASE;
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
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHG",
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
