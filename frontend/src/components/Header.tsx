"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";

const NAV_ITEMS = [
  { href: "/deposit", label: "Deposit" },
  { href: "/withdraw", label: "Withdraw" },
  { href: "/compliance", label: "Compliance" },
];

export function Header() {
  const { address, connect, disconnect, isConnecting } = useWallet();
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-white">
            DShield
          </Link>
          <nav className="flex gap-1">
            {NAV_ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === href
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div>
          {address ? (
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-mono text-zinc-300">
                {address.slice(0, 4)}...{address.slice(-4)}
              </span>
              <button
                onClick={disconnect}
                className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:text-white transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
