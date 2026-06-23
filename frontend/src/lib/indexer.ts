import * as StellarSdk from "@stellar/stellar-sdk";
import { getRpcServer, POOL_CONTRACT_ID } from "./stellar";
import { saveDeposit, getDeposits } from "./deposits";

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
  let startLedger: number | undefined;

  try {
    const latest = await server.getLatestLedger();
    startLedger = Math.max(1, latest.sequence - 17280);
  } catch {
    startLedger = 1;
  }

  let hasMore = true;

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
