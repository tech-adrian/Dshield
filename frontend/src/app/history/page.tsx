"use client";

import { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { getNotes } from "@/lib/notes";
import { getKyc } from "@/lib/kyc";

const TOKEN_DECIMALS = 7;
const TOKEN_SYMBOL = "USDC";

type ActivityItem = {
  type: "deposit" | "withdrawal" | "compliance";
  timestamp: number;
  commitment: string;
  amount: string;
  poolId?: string;
};

function buildActivity(): ActivityItem[] {
  if (typeof window === "undefined") return [];

  const notes = getNotes();
  const kyc = getKyc();
  const items: ActivityItem[] = [];

  for (const note of notes) {
    items.push({
      type: "deposit",
      timestamp: note.createdAt,
      commitment: note.commitment,
      amount: note.amount,
      poolId: note.poolId,
    });

    if (note.spent) {
      items.push({
        type: "withdrawal",
        timestamp: note.createdAt + 1,
        commitment: note.commitment,
        amount: note.amount,
        poolId: note.poolId,
      });
    }
  }

  if (kyc?.registeredOnChain) {
    items.push({
      type: "compliance",
      timestamp: kyc.createdAt,
      commitment: kyc.hash,
      amount: "0",
    });
  }

  items.sort((a, b) => b.timestamp - a.timestamp);
  return items;
}

function formatAmount(stroops: string): string {
  const n = Number(stroops);
  if (!n) return "—";
  return `${(n / 10 ** TOKEN_DECIMALS).toFixed(0)} ${TOKEN_SYMBOL}`;
}

function TypeBadge({ type }: { type: ActivityItem["type"] }) {
  const styles = {
    deposit: "bg-green-900/30 text-green-400",
    withdrawal: "bg-blue-900/30 text-blue-400",
    compliance: "bg-purple-900/30 text-purple-400",
  };
  const labels = {
    deposit: "Deposit",
    withdrawal: "Withdrawal",
    compliance: "KYC Registered",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[type]}`}
    >
      {labels[type]}
    </span>
  );
}

type FilterType = "all" | "deposit" | "withdrawal" | "compliance";

export default function HistoryPage() {
  const { address } = useWallet();
  const [filter, setFilter] = useState<FilterType>("all");
  const [activity] = useState(() => buildActivity());

  const filtered =
    filter === "all" ? activity : activity.filter((a) => a.type === filter);

  const stats = {
    deposits: activity.filter((a) => a.type === "deposit").length,
    withdrawals: activity.filter((a) => a.type === "withdrawal").length,
    compliance: activity.filter((a) => a.type === "compliance").length,
  };

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold">History</h1>
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-400">
            Connect your wallet to view history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold">Activity History</h1>
      <p className="mt-2 text-sm text-zinc-400">
        All shielded deposits, withdrawals, and compliance actions stored
        locally on this device.
      </p>

      {/* Stats */}
      <div className="mt-8 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{stats.deposits}</p>
          <p className="mt-1 text-xs text-zinc-500">Deposits</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">
            {stats.withdrawals}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Withdrawals</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center">
          <p className="text-2xl font-bold text-purple-400">
            {stats.compliance}
          </p>
          <p className="mt-1 text-xs text-zinc-500">KYC Proofs</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex gap-2">
        {(
          [
            { key: "all", label: "All" },
            { key: "deposit", label: "Deposits" },
            { key: "withdrawal", label: "Withdrawals" },
            { key: "compliance", label: "Compliance" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === key
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-white hover:bg-zinc-800/50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Activity list */}
      <div className="mt-6 space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-sm text-zinc-500">
              {activity.length === 0
                ? "No activity yet. Make your first deposit to get started."
                : "No matching activity."}
            </p>
          </div>
        ) : (
          filtered.map((item, i) => (
            <div
              key={`${item.commitment}-${item.type}-${i}`}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <TypeBadge type={item.type} />
                    {item.type !== "compliance" && (
                      <span className="text-sm font-semibold text-white">
                        {formatAmount(item.amount)}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 truncate font-mono text-xs text-zinc-600">
                    {item.commitment}
                  </p>
                </div>
                <span className="flex-shrink-0 text-xs text-zinc-600">
                  {new Date(item.timestamp).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
