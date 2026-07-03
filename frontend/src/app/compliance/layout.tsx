import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compliance",
  description:
    "Generate and verify compliance reports for shielded funds — share only what you choose.",
};

export default function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
