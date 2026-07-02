import { describe, it, expect, vi } from "vitest";

const VALID_G = "GABZWK2YLPOGBEOZT6VOCID6ROSSZGPSLAEPCTWIBGAJDHISO6DFKYYZ";
const VALID_C = "CDYZE3XQZA2UYUTYEEVLOKSYDD44CQZ6LYJIKQEDIUYBXNVSNXEQVGEG";

async function loadRoute(secret?: string) {
  vi.resetModules();
  if (secret === undefined) delete process.env.RELAYER_SECRET;
  else process.env.RELAYER_SECRET = secret;
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE = "Standalone Network ; September 2015";
  return (await import("./route")).POST;
}

const req = (body: unknown, ip = "1.2.3.4") =>
  ({
    json: async () => body,
    headers: { get: (k: string) => (k.toLowerCase() === "x-forwarded-for" ? ip : null) },
  }) as never;

const base = {
  poolId: VALID_C,
  recipient: VALID_G,
  publicInputs: "00",
  proof: "00",
};

describe("/api/relay-withdraw validation", () => {
  it("503 when the relayer secret is not configured", async () => {
    const POST = await loadRoute(undefined);
    const res = await POST(req(base));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("no_relayer");
  });

  it("400 on an invalid pool id", async () => {
    const POST = await loadRoute("Sxxx-dummy-secret");
    const res = await POST(req({ ...base, poolId: "not-a-contract" }));
    expect(res.status).toBe(400);
  });

  it("400 on an invalid recipient address", async () => {
    const POST = await loadRoute("Sxxx-dummy-secret");
    const res = await POST(req({ ...base, recipient: "nope" }));
    expect(res.status).toBe(400);
  });

  it("400 when publicInputs/proof are not hex", async () => {
    const POST = await loadRoute("Sxxx-dummy-secret");
    const res = await POST(req({ ...base, publicInputs: "zz", proof: "00" }));
    expect(res.status).toBe(400);
  });
});

describe("/api/relay-withdraw rate limiting", () => {
  it("429s a single IP after 20 requests within the window", async () => {
    const POST = await loadRoute("Sxxx-dummy-secret");
    for (let i = 0; i < 20; i++) {
      const res = await POST(req({ ...base, poolId: "not-a-contract" }, "9.9.9.9"));
      expect(res.status).toBe(400);
    }
    const extra = await POST(req({ ...base, poolId: "not-a-contract" }, "9.9.9.9"));
    expect(extra.status).toBe(429);
    expect((await extra.json()).code).toBe("rate_limited");
  });
});
