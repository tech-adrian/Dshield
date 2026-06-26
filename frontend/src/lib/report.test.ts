import { describe, it, expect } from "vitest";
import { formatReportText, type ComplianceReport } from "./report";

const base: ComplianceReport = {
  note: "dshield-v1-CABC-9-100000000-deadbeef-00aa-00bb",
  network: "Testnet",
  poolId: "CABC",
  commitment: "0xdeadbeef",
  nullifierHash: "0x00aa",
  integrityOk: true,
  depositConfirmed: true,
  leafIndex: 9,
  withdrawn: true,
  depositTx: { hash: "abc123", at: "2026-06-26T00:00:00Z" },
  withdrawTx: { hash: "def456", at: "2026-06-26T01:00:00Z" },
  generatedAt: 0,
};

describe("formatReportText", () => {
  it("includes the embedded note and the key on-chain facts", () => {
    const t = formatReportText(base);
    expect(t).toContain("DShield Compliance Report");
    expect(t).toContain(base.note);
    expect(t).toContain("leaf #9");
    expect(t).toContain("Withdrawn");
    expect(t).toContain(base.commitment);
    expect(t).toContain("abc123");
  });

  it("never leaks an amount or address (none are in the model)", () => {
    const t = formatReportText(base).toLowerCase();
    expect(t).not.toContain("usdc");
    expect(t).not.toContain("amount");
  });

  it("renders the unconfirmed / unspent / no-tx case", () => {
    const t = formatReportText({
      ...base,
      depositConfirmed: false,
      leafIndex: null,
      withdrawn: false,
      depositTx: null,
      withdrawTx: null,
    });
    expect(t).toContain("Not found on-chain");
    expect(t).toContain("In pool (unspent)");
    expect(t).toContain("Deposit tx          n/a");
  });
});
