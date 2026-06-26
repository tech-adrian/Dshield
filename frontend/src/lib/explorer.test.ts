import { describe, it, expect } from "vitest";
import { explorerTxUrl, explorerContractUrl, getNetworkLabel } from "./explorer";

// No env is loaded in tests, so the network passphrase falls back to the
// standalone default — exercising the "local, no explorer" branch.
describe("explorer (local network default)", () => {
  it("labels the network as local", () => {
    expect(getNetworkLabel()).toBe("Local / Standalone");
  });

  it("returns no explorer links on a network without one", () => {
    expect(explorerTxUrl("abc123")).toBeNull();
    expect(explorerContractUrl("CABC")).toBeNull();
  });

  it("returns null for empty inputs", () => {
    expect(explorerTxUrl("")).toBeNull();
    expect(explorerContractUrl("")).toBeNull();
  });
});
