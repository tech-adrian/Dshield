import { describe, it, expect, vi } from "vitest";

describe("indexer", () => {
  it("syncDepositsFromChain is importable", async () => {
    const mod = await import("./indexer");
    expect(typeof mod.syncDepositsFromChain).toBe("function");
  });

  it("syncDepositsFromChain returns 0 when POOL_CONTRACT_ID is empty", async () => {
    vi.doMock("./stellar", () => ({
      POOL_CONTRACT_ID: "",
      getRpcServer: vi.fn(),
    }));
    const { syncDepositsFromChain } = await import("./indexer");
    const result = await syncDepositsFromChain();
    expect(result).toBe(0);
    vi.doUnmock("./stellar");
  });
});
