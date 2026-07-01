import { NextRequest, NextResponse } from "next/server";
import * as StellarSdk from "@stellar/stellar-sdk";

const ADMIN_SECRET = process.env.COMPLIANCE_ADMIN_SECRET || "";
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8000/soroban/rpc";
const PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ||
  "Standalone Network ; February 2017";
const COMPLIANCE_CONTRACT_ID =
  process.env.NEXT_PUBLIC_COMPLIANCE_CONTRACT_ID || "";

export async function POST(req: NextRequest) {
  if (!ADMIN_SECRET) {
    return NextResponse.json(
      { error: "KYC registration is not configured (COMPLIANCE_ADMIN_SECRET unset)." },
      { status: 503 },
    );
  }
  if (!COMPLIANCE_CONTRACT_ID) {
    return NextResponse.json(
      { error: "Compliance contract not configured." },
      { status: 503 },
    );
  }

  let kycHashHex: string;
  try {
    const body = await req.json();
    kycHashHex = String(body.kycHash || "");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!/^[0-9a-fA-F]{64}$/.test(kycHashHex)) {
    return NextResponse.json(
      { error: "kycHash must be exactly 64 hex characters (32 bytes)." },
      { status: 400 },
    );
  }

  try {
    const server = new StellarSdk.rpc.Server(RPC_URL, {
      allowHttp: RPC_URL.startsWith("http://"),
    });
    const admin = StellarSdk.Keypair.fromSecret(ADMIN_SECRET);
    const contract = new StellarSdk.Contract(COMPLIANCE_CONTRACT_ID);

    const kycHashScVal = StellarSdk.xdr.ScVal.scvBytes(
      Buffer.from(kycHashHex, "hex"),
    );

    const source = await server.getAccount(admin.publicKey());
    const tx = new StellarSdk.TransactionBuilder(source, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(contract.call("register_kyc", kycHashScVal))
      .setTimeout(60)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(sim)) {
      return NextResponse.json(
        { error: `Simulation failed: ${sim.error}` },
        { status: 400 },
      );
    }

    const assembled = StellarSdk.rpc.assembleTransaction(tx, sim).build();
    assembled.sign(admin);

    const sent = await server.sendTransaction(assembled);
    if (sent.status === "ERROR") {
      return NextResponse.json(
        { error: "KYC registration transaction rejected by the network." },
        { status: 500 },
      );
    }

    let result = await server.getTransaction(sent.hash);
    let tries = 0;
    while (result.status === "NOT_FOUND" && tries < 30) {
      await new Promise((r) => setTimeout(r, 1000));
      result = await server.getTransaction(sent.hash);
      tries++;
    }
    if (result.status !== "SUCCESS") {
      return NextResponse.json(
        { error: `KYC registration failed on-chain (${result.status}).` },
        { status: 500 },
      );
    }

    return NextResponse.json({ hash: sent.hash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("KYC registration failed:", message);
    return NextResponse.json(
      { error: `KYC registration failed: ${message}` },
      { status: 500 },
    );
  }
}
