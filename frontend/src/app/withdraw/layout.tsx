import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Withdraw",
  description:
    "Redeem shielded notes privately — nothing links the withdrawal to your deposit.",
};

export default function WithdrawLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
