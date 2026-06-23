import { describe, it, expect } from "vitest";
import {
  saveDeposit,
  getDeposits,
  getAllCommitments,
  clearDeposits,
  type DepositRecord,
} from "./deposits";

function makeDeposit(overrides: Partial<DepositRecord> = {}): DepositRecord {
  return {
    commitment: "aabbccdd",
    leafIndex: 0,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("saveDeposit / getDeposits", () => {
  it("returns empty array when nothing saved", () => {
    expect(getDeposits()).toEqual([]);
  });

  it("saves and retrieves a deposit", () => {
    saveDeposit(makeDeposit());
    const deposits = getDeposits();
    expect(deposits).toHaveLength(1);
    expect(deposits[0].commitment).toBe("aabbccdd");
  });

  it("ignores duplicate commitments", () => {
    saveDeposit(makeDeposit({ commitment: "aaa" }));
    saveDeposit(makeDeposit({ commitment: "aaa" }));
    expect(getDeposits()).toHaveLength(1);
  });

  it("sorts by leafIndex", () => {
    saveDeposit(makeDeposit({ commitment: "c", leafIndex: 2 }));
    saveDeposit(makeDeposit({ commitment: "a", leafIndex: 0 }));
    saveDeposit(makeDeposit({ commitment: "b", leafIndex: 1 }));
    const deposits = getDeposits();
    expect(deposits.map((d) => d.leafIndex)).toEqual([0, 1, 2]);
    expect(deposits.map((d) => d.commitment)).toEqual(["a", "b", "c"]);
  });
});

describe("getAllCommitments", () => {
  it("returns empty array when nothing saved", () => {
    expect(getAllCommitments()).toEqual([]);
  });

  it("returns commitments in order", () => {
    saveDeposit(makeDeposit({ commitment: "aaa", leafIndex: 0 }));
    saveDeposit(makeDeposit({ commitment: "bbb", leafIndex: 1 }));
    const commitments = getAllCommitments();
    expect(commitments).toEqual(["aaa", "bbb"]);
  });

  it("fills gaps with zero bytes", () => {
    saveDeposit(makeDeposit({ commitment: "ccc", leafIndex: 2 }));
    const commitments = getAllCommitments();
    const zeroPadding = "0x" + "00".repeat(32);
    expect(commitments).toHaveLength(3);
    expect(commitments[0]).toBe(zeroPadding);
    expect(commitments[1]).toBe(zeroPadding);
    expect(commitments[2]).toBe("ccc");
  });

  it("fills interior gap when deposits at index 0 and 2 but not 1", () => {
    saveDeposit(makeDeposit({ commitment: "first", leafIndex: 0 }));
    saveDeposit(makeDeposit({ commitment: "third", leafIndex: 2 }));
    const commitments = getAllCommitments();
    const zeroPadding = "0x" + "00".repeat(32);
    expect(commitments).toHaveLength(3);
    expect(commitments[0]).toBe("first");
    expect(commitments[1]).toBe(zeroPadding);
    expect(commitments[2]).toBe("third");
  });

  it("scopes strictly to the requested pool", () => {
    saveDeposit(makeDeposit({ commitment: "pa", leafIndex: 0, poolId: "POOL_A" }));
    saveDeposit(makeDeposit({ commitment: "pb", leafIndex: 0, poolId: "POOL_B" }));
    expect(getAllCommitments("POOL_A")).toEqual(["pa"]);
    expect(getAllCommitments("POOL_B")).toEqual(["pb"]);
  });

  it("excludes legacy records without a poolId when a pool is requested", () => {
    // A stale record from a previous deployment must not leak into the tree.
    saveDeposit(makeDeposit({ commitment: "legacy", leafIndex: 0 }));
    saveDeposit(makeDeposit({ commitment: "current", leafIndex: 1, poolId: "POOL_A" }));
    const commitments = getAllCommitments("POOL_A");
    const zeroPadding = "0x" + "00".repeat(32);
    expect(commitments).toEqual([zeroPadding, "current"]);
  });
});

describe("clearDeposits", () => {
  it("clears the entire cache when no pool is given", () => {
    saveDeposit(makeDeposit({ commitment: "a", leafIndex: 0, poolId: "POOL_A" }));
    saveDeposit(makeDeposit({ commitment: "b", leafIndex: 1, poolId: "POOL_B" }));
    const removed = clearDeposits();
    expect(removed).toBe(2);
    expect(getDeposits()).toEqual([]);
  });

  it("clears only the requested pool's records", () => {
    saveDeposit(makeDeposit({ commitment: "a", leafIndex: 0, poolId: "POOL_A" }));
    saveDeposit(makeDeposit({ commitment: "b", leafIndex: 1, poolId: "POOL_B" }));
    const removed = clearDeposits("POOL_A");
    expect(removed).toBe(1);
    const remaining = getDeposits();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].poolId).toBe("POOL_B");
  });

  it("returns 0 when nothing matches", () => {
    saveDeposit(makeDeposit({ commitment: "a", leafIndex: 0, poolId: "POOL_A" }));
    expect(clearDeposits("POOL_X")).toBe(0);
    expect(getDeposits()).toHaveLength(1);
  });
});
