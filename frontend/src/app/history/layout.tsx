import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "History",
  description:
    "Your shielded deposits, withdrawals, and compliance activity — stored only on your device.",
};

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
