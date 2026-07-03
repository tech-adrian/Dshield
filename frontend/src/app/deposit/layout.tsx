import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deposit",
  description: "Shield USDC into the private pool and receive a shielded note.",
};

export default function DepositLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
