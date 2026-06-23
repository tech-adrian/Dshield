import { describe, it, expect } from "vitest";
import {
  saveDeposit,
  getDeposits,
  getAllCommitments,
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
});
