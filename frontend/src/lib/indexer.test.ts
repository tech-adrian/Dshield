import { describe, it, expect, vi, afterEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("./stellar");
});

describe("indexer", () => {
  it("syncDepositsFromChain is importable", async () => {
    const mod = await import("./indexer");
    expect(typeof mod.syncDepositsFromChain).toBe("function");
  });

  it("syncDepositsFromChain returns 0 when POOL_CONTRACT_ID is empty", async () => {
    vi.doMock("./stellar", () => ({
      POOL_CONTRACT_ID: "",
      getRpcServer: vi.fn(),
      queryContract: vi.fn(),
    }));
    const { syncDepositsFromChain } = await import("./indexer");
    const result = await syncDepositsFromChain();
    expect(result).toBe(0);
  });
});

describe("fetchCommitmentsFromChain", () => {
  it("returns null when no pool id is configured", async () => {
    vi.doMock("./stellar", () => ({
      POOL_CONTRACT_ID: "",
      getRpcServer: vi.fn(),
      queryContract: vi.fn(),
    }));
    const { fetchCommitmentsFromChain } = await import("./indexer");
    expect(await fetchCommitmentsFromChain()).toBeNull();
  });

  it("returns null when the contract call fails", async () => {
    vi.doMock("./stellar", () => ({
      POOL_CONTRACT_ID: "POOL_X",
      getRpcServer: vi.fn(),
      queryContract: vi.fn().mockResolvedValue(null),
    }));
    const { fetchCommitmentsFromChain } = await import("./indexer");
    expect(await fetchCommitmentsFromChain("POOL_X")).toBeNull();
  });

  it("returns ordered 0x-prefixed 32-byte hex commitments", async () => {
    const leaf0 = new Uint8Array(32).fill(0);
    leaf0[31] = 0xaa;
    const leaf1 = new Uint8Array(32).fill(0);
    leaf1[31] = 0xbb;
    // get_commitments returns an ScVec of ScBytes; build it so scValToNative
    // yields the array of byte buffers the function expects.
    const scVal = StellarSdk.nativeToScVal([Buffer.from(leaf0), Buffer.from(leaf1)]);

    vi.doMock("./stellar", () => ({
      POOL_CONTRACT_ID: "POOL_X",
      getRpcServer: vi.fn(),
      queryContract: vi.fn().mockResolvedValue(scVal),
    }));
    const { fetchCommitmentsFromChain } = await import("./indexer");
    const result = await fetchCommitmentsFromChain("POOL_X");
    expect(result).toEqual([
      "0x" + "00".repeat(31) + "aa",
      "0x" + "00".repeat(31) + "bb",
    ]);
  });
});
