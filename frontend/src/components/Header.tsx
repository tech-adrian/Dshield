"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";

const NAV_ITEMS = [
  { href: "/deposit", label: "Deposit" },
  { href: "/withdraw", label: "Withdraw" },
  { href: "/compliance", label: "Compliance" },
  { href: "/history", label: "History" },
];

export function Header() {
  const { address, connect, disconnect, isConnecting } = useWallet();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl"
        >
          <Image src="/dshield.png" alt="DShield" width={32} height={32} />
          <span className="hidden xs:inline">DShield</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-1">
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

        <div className="flex items-center gap-2">
          {/* Wallet */}
          {address ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-mono text-zinc-300">
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
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-zinc-200 disabled:opacity-50 sm:px-4 sm:py-2 sm:text-sm"
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex md:hidden items-center justify-center rounded-lg p-2 text-zinc-400 hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-5 w-5"
            >
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav className="border-t border-zinc-800 px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  pathname === href
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
          {address && (
            <div className="mt-2 border-t border-zinc-800/50 pt-2">
              <span className="block rounded-lg px-3 py-2 text-xs font-mono text-zinc-500">
                {address.slice(0, 8)}...{address.slice(-8)}
              </span>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}
