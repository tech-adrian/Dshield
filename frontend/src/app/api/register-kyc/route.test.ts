import { describe, it, expect, vi } from "vitest";

const VALID_HASH = "aa".repeat(32);

interface RouteEnv {
  adminSecret?: string;
  contractId?: string;
  apiKey?: string;
}

async function loadRoute(env: RouteEnv) {
  vi.resetModules();
  const setOrDelete = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  setOrDelete("COMPLIANCE_ADMIN_SECRET", env.adminSecret);
  setOrDelete("NEXT_PUBLIC_COMPLIANCE_CONTRACT_ID", env.contractId);
  setOrDelete("KYC_ADMIN_API_KEY", env.apiKey);
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE = "Standalone Network ; February 2017";
  return (await import("./route")).POST;
}

// Minimal NextRequest stand-in — the handler calls req.json() and
// req.headers.get("x-admin-key").
const req = (body: unknown, headers: Record<string, string> = {}) =>
  ({
    json: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  }) as never;

const configured = {
  adminSecret: "Sxxx-dummy-admin-secret",
  contractId: "CDYZE3XQZA2UYUTYEEVLOKSYDD44CQZ6LYJIKQEDIUYBXNVSNXEQVGEG",
  apiKey: "test-shared-secret",
};

describe("/api/register-kyc auth + validation", () => {
  it("503 when the admin secret is not configured", async () => {
    const POST = await loadRoute({ ...configured, adminSecret: undefined });
    const res = await POST(req({ kycHash: VALID_HASH }, { "x-admin-key": configured.apiKey }));
    expect(res.status).toBe(503);
  });

  it("503 when the compliance contract id is not configured", async () => {
    const POST = await loadRoute({ ...configured, contractId: undefined });
    const res = await POST(req({ kycHash: VALID_HASH }, { "x-admin-key": configured.apiKey }));
    expect(res.status).toBe(503);
  });

  it("503 when KYC_ADMIN_API_KEY is not configured", async () => {
    const POST = await loadRoute({ ...configured, apiKey: undefined });
    const res = await POST(req({ kycHash: VALID_HASH }, { "x-admin-key": "anything" }));
    expect(res.status).toBe(503);
  });

  it("401 when no x-admin-key header is presented", async () => {
    const POST = await loadRoute(configured);
    const res = await POST(req({ kycHash: VALID_HASH }));
    expect(res.status).toBe(401);
  });

  it("401 when the x-admin-key header is wrong", async () => {
    const POST = await loadRoute(configured);
    const res = await POST(req({ kycHash: VALID_HASH }, { "x-admin-key": "wrong-secret" }));
    expect(res.status).toBe(401);
  });

  it("400 on a malformed kycHash even with a valid key", async () => {
    const POST = await loadRoute(configured);
    const res = await POST(
      req({ kycHash: "not-hex" }, { "x-admin-key": configured.apiKey }),
    );
    expect(res.status).toBe(400);
  });
});
