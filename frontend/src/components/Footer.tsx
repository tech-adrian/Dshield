
const EXPLORER_BASE = "https://stellar.expert/explorer/testnet/contract";
const CONTRACTS = [
  {
    label: "Shielded Pool",
    id: process.env.NEXT_PUBLIC_POOL_CONTRACT_ID,
  },
  {
    label: "Compliance",
    id: process.env.NEXT_PUBLIC_COMPLIANCE_CONTRACT_ID,
  },
];

export function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-6 sm:grid-cols-3 sm:gap-8">
          <div>
            <h4 className="text-sm font-semibold text-white">DShield</h4>
            <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
              Private by Default. Compliant by Choice.
              <br />A shielded stablecoin wallet built on Stellar using
              Zero-Knowledge Proofs.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white">Contracts</h4>
            <ul className="mt-2 space-y-1.5">
              {CONTRACTS.map(
                ({ label, id }) =>
                  id && (
                    <li key={id}>
                      <a
                        href={`${EXPLORER_BASE}/${id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-500 hover:text-white transition-colors"
                      >
                        {label}&ensp;
                        <span className="font-mono">
                          {id.slice(0, 4)}...{id.slice(-4)}
                        </span>
                      </a>
                    </li>
                  ),
              )}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white">Links</h4>
            <ul className="mt-2 space-y-1.5">
              <li>
                <a
                  href="https://github.com/tech-adrian/Dshield"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-zinc-500 hover:text-white transition-colors"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://stellar.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-zinc-500 hover:text-white transition-colors"
                >
                  Stellar
                </a>
              </li>
              <li>
                <a
                  href="https://noir-lang.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-zinc-500 hover:text-white transition-colors"
                >
                  Noir
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-2 border-t border-zinc-800/50 pt-6">
          <p className="text-xs text-zinc-600">
            Built for{" "}
            <span className="text-zinc-400">Stellar Hacks: Real-World ZK</span>
          </p>
          <p className="text-xs text-zinc-700">
            Testnet demo only &mdash; unaudited. Not for production use.
          </p>
        </div>
      </div>
    </footer>
  );
}
