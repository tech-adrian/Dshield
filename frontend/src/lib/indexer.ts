import * as StellarSdk from "@stellar/stellar-sdk";
import { getRpcServer, POOL_CONTRACT_ID, queryContract } from "./stellar";
import { saveDeposit, getDeposits } from "./deposits";

/**
 * Fetch the complete, ordered list of commitments directly from the pool
 * contract's storage (via the `get_commitments` view). This is the
 * authoritative source for rebuilding the Merkle tree — unlike scanning
 * deposit events, it does not depend on RPC event retention, so it always
 * returns every leaf the contract has inserted.
 *
 * Returns commitments as 0x-prefixed 32-byte hex strings in leaf-index order,
 * or null if the call fails (e.g. an older pool deployment without the view).
 */
export async function fetchCommitmentsFromChain(
  poolId?: string,
): Promise<string[] | null> {
  const targetPool = poolId || POOL_CONTRACT_ID;
  if (!targetPool) return null;

  const result = await queryContract(targetPool, "get_commitments");
  if (!result) return null;

  const native = StellarSdk.scValToNative(result) as unknown;
  if (!Array.isArray(native)) return null;

  return native.map((buf: unknown) => {
    const bytes = Buffer.from(buf as Uint8Array);
    return "0x" + bytes.toString("hex").padStart(64, "0");
  });
}

export async function syncDepositsFromChain(
  poolId?: string,
): Promise<number> {
  const targetPool = poolId || POOL_CONTRACT_ID;
  if (!targetPool) return 0;

  const server = getRpcServer();
  const existingDeposits = getDeposits().filter(
    (d) => !d.poolId || d.poolId === targetPool,
  );
  const knownIndices = new Set(existingDeposits.map((d) => d.leafIndex));

  let synced = 0;
  let cursor: string | undefined;
  // Reconstructing the Merkle tree requires EVERY deposit, so scan from the
  // start of the chain rather than a recent window. On a network whose event
  // retention does not reach ledger 1, the getEvents call below will throw and
  // we fall back to the largest window the RPC allows.
  let startLedger = 1;
  try {
    const latest = await server.getLatestLedger();
    if (latest.sequence > 0 && startLedger > latest.sequence) {
      startLedger = latest.sequence;
    }
  } catch {
    startLedger = 1;
  }

  let hasMore = true;
  let triedRetentionFallback = false;

  while (hasMore) {
    let response: StellarSdk.rpc.Api.GetEventsResponse;
    try {
      const filters = [
        {
          type: "contract" as const,
          contractIds: [targetPool],
          topics: [["AAAADwAAAAdkZXBvc2l0AA==", "*"]],
        },
      ];
      const opts = cursor
        ? { filters, cursor, limit: 100 }
        : { filters, startLedger, limit: 100 };
      response = await server.getEvents(opts);
    } catch {
      // A start ledger older than the RPC's event retention window throws.
      // Retry once from the most recent window the RPC is likely to keep.
      if (!cursor && !triedRetentionFallback) {
        triedRetentionFallback = true;
        try {
          const latest = await server.getLatestLedger();
          startLedger = Math.max(1, latest.sequence - 17280);
          continue;
        } catch {
          break;
        }
      }
      break;
    }

    const events = response.events || [];

    for (const event of events) {
      try {
        if (!event.topic || event.topic.length < 2) continue;

        const idxScVal = event.topic[1];
        const leafIndex = StellarSdk.scValToNative(idxScVal) as number;

        if (knownIndices.has(leafIndex)) continue;

        const dataMap = StellarSdk.scValToNative(event.value) as Record<
          string,
          unknown
        >;
        let commitment: string;

        if (dataMap && typeof dataMap === "object" && "commitment" in dataMap) {
          const buf = dataMap.commitment as Buffer;
          commitment = Buffer.from(buf).toString("hex");
        } else {
          continue;
        }

        saveDeposit({
          commitment,
          leafIndex,
          timestamp: Date.now(),
          poolId: targetPool,
        });
        knownIndices.add(leafIndex);
        synced++;
      } catch {
        continue;
      }
    }

    if (events.length < 100) {
      hasMore = false;
    } else {
      cursor = events[events.length - 1].id;
    }
  }

  return synced;
}
