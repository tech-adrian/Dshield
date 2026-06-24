"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";
import { Button } from "./ui/Button";
import { MenuIcon, CloseIcon } from "./icons";
import { truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/cn";

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
    // Floating pill: inset from the page edges (sticky with padding) and fully
    // rounded, so it reads as an elevated element rather than a full-bleed bar.
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="mx-auto max-w-5xl rounded-2xl border border-zinc-800/80 bg-zinc-950/70 shadow-lg shadow-black/20 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-3 sm:px-4">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-bold text-white"
          >
            <Image
              src="/dshield-mark.png"
              alt="DShield"
              width={25}
              height={28}
              priority
            />
            <span className="hidden xs:inline">DShield</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden gap-1 md:flex">
            {NAV_ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  pathname === href
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {/* Wallet */}
            {address ? (
              <div className="flex items-center gap-2">
                <span className="hidden rounded-full bg-zinc-800 px-3 py-1.5 font-mono text-xs text-zinc-300 sm:inline">
                  {truncateMiddle(address, 4, 4)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={disconnect}
                  className="text-zinc-500"
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={connect}
                disabled={isConnecting}
                className="sm:px-4 sm:py-2 sm:text-sm"
              >
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </Button>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex items-center justify-center rounded-lg p-2 text-zinc-400 transition-colors hover:text-white md:hidden"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <CloseIcon className="h-5 w-5" />
              ) : (
                <MenuIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileOpen && (
          <nav className="border-t border-zinc-800 px-3 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    pathname === href
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white",
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
            {address && (
              <div className="mt-2 border-t border-zinc-800/50 pt-2">
                <span className="block rounded-lg px-3 py-2 font-mono text-xs text-zinc-500">
                  {truncateMiddle(address, 8, 8)}
                </span>
              </div>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
