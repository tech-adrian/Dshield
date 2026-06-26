"use client";

import { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  buildContractCall,
  submitTransaction,
  queryContract,
  getPoolTiers,
  ensureUsdcTrustline,
  faucetUsdc,
  getUsdcSacId,
  type PoolTier,
} from "@/lib/stellar";
import {
  saveNote,
  serializeNote,
  generateRandomField,
  type ShieldedNote,
} from "@/lib/notes";
import { saveDeposit } from "@/lib/deposits";
import { computeCommitment } from "@/lib/poseidon2";
import { TOKEN_DECIMALS, TOKEN_SYMBOL, formatStroops } from "@/lib/format";
import { PageShell, PageHeader, ConnectGate } from "@/components/ui/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SelectButton } from "@/components/ui/SelectButton";
import { StatusMessage } from "@/components/ui/StatusMessage";
import * as StellarSdk from "@stellar/stellar-sdk";

export default function DepositPage() {
  const { address, signTransaction } = useWallet();
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionNotes, setSessionNotes] = useState<ShieldedNote[]>([]);
  const [copiedKey, setCopiedKey] = useState<string>("");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [tiers] = useState<PoolTier[]>(() => getPoolTiers());
  const [selectedTier, setSelectedTier] = useState<PoolTier | null>(() => {
    const t = getPoolTiers();
    return t.length > 0 ? t[0] : null;
  });

  const noteCount = (() => {
    if (!customAmount || !selectedTier) return 1;
    const usdc = parseFloat(customAmount);
    if (isNaN(usdc) || usdc <= 0) return 0;
    const tierUsdc = selectedTier.amount / 10 ** TOKEN_DECIMALS;
    return Math.floor(usdc / tierUsdc);
  })();

  const totalNotes = customAmount ? noteCount : 1;

  async function handleDeposit() {
    if (!address || !selectedTier || totalNotes <= 0) return;

    setIsLoading(true);
    setSessionNotes([]);
    const total = totalNotes;
    const created: ShieldedNote[] = [];

    try {
      // Make sure the connected wallet can actually hold and pay USDC:
      // establish the trustline (wallet signs) and faucet test funds if short.
      // Both are no-ops once satisfied.
      const sac = getUsdcSacId();
      if (sac) {
        setStatus("Checking USDC trustline...");
        await ensureUsdcTrustline(address, signTransaction);

        const needed = selectedTier.amount * total;
        const balVal = await queryContract(sac, "balance", [
          StellarSdk.nativeToScVal(address, { type: "address" }),
        ]);
        const balance = balVal
          ? BigInt(StellarSdk.scValToNative(balVal) as string | number)
          : BigInt(0);
        if (balance < BigInt(needed)) {
          setStatus("Funding wallet with test USDC...");
          // Mint a generous buffer so subsequent deposits don't re-faucet.
          await faucetUsdc(address, BigInt(needed) * BigInt(2) - balance);
        }
      }

      for (let n = 0; n < total; n++) {
        setStatus(
          total > 1
            ? `Note ${n + 1}/${total}: Generating nullifier and secret...`
            : "Generating nullifier and secret...",
        );

        const nullifier = generateRandomField();
        const secret = generateRandomField();

        const commitment = await computeCommitment(nullifier, secret);
        const commitmentClean = commitment.replace(/^0x/, "");

        const nextIndexVal = await queryContract(
          selectedTier.id,
          "get_next_index",
        );
        const leafIndex = nextIndexVal
          ? Number(StellarSdk.scValToNative(nextIndexVal))
          : 0;

        setStatus(
          total > 1
            ? `Note ${n + 1}/${total}: Building transaction...`
            : "Building transaction...",
        );
        const depositorScVal = StellarSdk.nativeToScVal(address, {
          type: "address",
        });
        const commitmentScVal = StellarSdk.xdr.ScVal.scvBytes(
          Buffer.from(commitmentClean, "hex"),
        );

        const tx = await buildContractCall(
          selectedTier.id,
          "deposit",
          [depositorScVal, commitmentScVal],
          address,
        );

        setStatus(
          total > 1
            ? `Note ${n + 1}/${total}: Signing...`
            : "Signing transaction...",
        );
        const signedXdr = await signTransaction(tx.toXDR());

        setStatus(
          total > 1
            ? `Note ${n + 1}/${total}: Submitting...`
            : "Submitting transaction...",
        );
        await submitTransaction(signedXdr);

        const note: ShieldedNote = {
          nullifier,
          secret,
          commitment: commitmentClean,
          leafIndex,
          amount: String(selectedTier.amount),
          spent: false,
          createdAt: Date.now(),
          poolId: selectedTier.id,
        };
        saveNote(note);
        created.push(note);

        saveDeposit({
          commitment: commitmentClean,
          leafIndex,
          timestamp: Date.now(),
          poolId: selectedTier.id,
        });
      }

      setSessionNotes(created);

      const totalUsdc = (total * selectedTier.amount) / 10 ** TOKEN_DECIMALS;
      setStatus(
        `Deposit successful! ${totalUsdc} ${TOKEN_SYMBOL} shielded across ${total} note${total > 1 ? "s" : ""}.`,
      );
    } catch (err) {
      let errorMessage = "Unknown error";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === "string") {
        errorMessage = err;
      } else if (err && typeof err === "object") {
        errorMessage = JSON.stringify(err);
      }
      console.error("Deposit error:", err);
      setStatus(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setCustomAmount("");
    }
  }

  function copyText(text: string, key: string) {
    void navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((c) => (c === key ? "" : c)), 1500);
  }

  function downloadBackup() {
    const body = sessionNotes.map(serializeNote).join("\n") + "\n";
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dshield-notes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!address) {
    return (
      <ConnectGate title="Deposit" prompt="Connect your wallet to deposit." />
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Deposit into Shielded Pool"
        description="Your funds are shielded using a cryptographic commitment. The commitment is stored on-chain but reveals nothing about your identity or balance."
      />

      <Card className="mt-8">
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400">How it works</h3>
          <ol className="mt-3 space-y-2 text-sm text-zinc-500">
            <li>1. Choose a denomination (all deposits in a tier are identical)</li>
            <li>2. A Poseidon2 commitment is computed from random values</li>
            <li>3. Your {TOKEN_SYMBOL} is transferred to the shielded pool</li>
            <li>4. Your note is saved locally for future withdrawal</li>
          </ol>
        </div>

        {tiers.length > 1 && (
          <div className="mb-4">
            <label className="mb-2 block text-xs text-zinc-500">
              Select Denomination
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {tiers.map((tier) => (
                <SelectButton
                  key={tier.id}
                  selected={selectedTier?.id === tier.id}
                  onClick={() => setSelectedTier(tier)}
                  disabled={isLoading}
                  className="text-center font-medium"
                >
                  {tier.label}
                </SelectButton>
              ))}
            </div>
          </div>
        )}

        {selectedTier && (
          <div className="mb-4">
            <Input
              type="number"
              label={`Amount (${TOKEN_SYMBOL})`}
              mono
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder={String(selectedTier.amount / 10 ** TOKEN_DECIMALS)}
              min={selectedTier.amount / 10 ** TOKEN_DECIMALS}
              step={selectedTier.amount / 10 ** TOKEN_DECIMALS}
              hint={(() => {
                if (!customAmount) {
                  return `Leave empty for a single ${formatStroops(selectedTier.amount)} deposit. Enter a larger amount to create multiple notes.`;
                }
                const usdc = parseFloat(customAmount);
                const tierUsdc = selectedTier.amount / 10 ** TOKEN_DECIMALS;
                if (isNaN(usdc) || usdc < tierUsdc) {
                  return `Minimum: ${tierUsdc} ${TOKEN_SYMBOL}`;
                }
                const shielded = noteCount * tierUsdc;
                const remainder = usdc - shielded;
                return (
                  <>
                    Creates{" "}
                    <span className="text-zinc-400">
                      {noteCount} note{noteCount > 1 ? "s" : ""}
                    </span>{" "}
                    of {formatStroops(selectedTier.amount)} each
                    {" = "}
                    <span className="text-zinc-400">
                      {shielded} {TOKEN_SYMBOL}
                    </span>{" "}
                    shielded
                    {remainder > 0 && (
                      <span className="text-yellow-500">
                        {" "}
                        ({remainder} {TOKEN_SYMBOL} remainder not shielded)
                      </span>
                    )}
                  </>
                );
              })()}
            />
          </div>
        )}

        <Button
          fullWidth
          size="lg"
          onClick={handleDeposit}
          disabled={
            isLoading || !selectedTier || (!!customAmount && noteCount <= 0)
          }
        >
          {isLoading
            ? "Processing..."
            : selectedTier
              ? customAmount && noteCount > 1
                ? `Shield ${(noteCount * selectedTier.amount) / 10 ** TOKEN_DECIMALS} ${TOKEN_SYMBOL} (${noteCount} notes)`
                : `Shield ${formatStroops(selectedTier.amount)}`
              : "Select a denomination"}
        </Button>

        {status && <StatusMessage message={status} className="mt-4" />}

        {sessionNotes.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-yellow-600/40 bg-yellow-950/20 p-3">
              <p className="text-xs font-semibold text-yellow-300">
                Back up your shielded note
                {sessionNotes.length > 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-yellow-200/70">
                This note is the <span className="font-medium">only</span> way to
                withdraw these funds. It&apos;s saved in this browser, but if you
                clear site data or switch devices it&apos;s gone for good. Copy it
                or download the backup and keep it somewhere safe and private —
                anyone with the note can spend it.
              </p>
            </div>

            {sessionNotes.map((note, i) => {
              const serialized = serializeNote(note);
              return (
                <div
                  key={note.commitment}
                  className="rounded-xl bg-zinc-800/80 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">
                      Shielded Note
                      {sessionNotes.length > 1
                        ? ` ${i + 1}/${sessionNotes.length}`
                        : ""}{" "}
                      · {formatStroops(Number(note.amount))}
                    </p>
                    <button
                      type="button"
                      onClick={() => copyText(serialized, note.commitment)}
                      className="shrink-0 text-xs font-medium text-brand-400 hover:text-brand-300"
                    >
                      {copiedKey === note.commitment ? "Copied!" : "Copy note"}
                    </button>
                  </div>
                  <p className="mt-1.5 break-all font-mono text-xs text-zinc-200">
                    {serialized}
                  </p>
                  <p className="mt-2 break-all font-mono text-[11px] text-zinc-600">
                    Commitment: {note.commitment}
                  </p>
                </div>
              );
            })}

            <Button variant="outline" fullWidth onClick={downloadBackup}>
              {sessionNotes.length > 1
                ? `Download all ${sessionNotes.length} notes (.txt)`
                : "Download note backup (.txt)"}
            </Button>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
