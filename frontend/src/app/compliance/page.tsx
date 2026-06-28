"use client";

import { useState, useEffect, useReducer } from "react";
import { getNotes, saveNoteIfNew, type ShieldedNote } from "@/lib/notes";
import { friendlyError } from "@/lib/errors";
import { syncSpentNotes } from "@/lib/sync";
import {
  buildComplianceReport,
  formatReportText,
  type ComplianceReport,
} from "@/lib/report";
import { explorerTxUrl, explorerContractUrl } from "@/lib/explorer";
import { truncateMiddle } from "@/lib/format";
import { PageShell, PageHeader } from "@/components/ui/Page";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SelectButton } from "@/components/ui/SelectButton";
import { useToast } from "@/components/ui/Toast";
import { NoteImport } from "@/components/ui/NoteImport";

type Mode = "generate" | "verify";

// What a note-based report proves vs. what it never discloses. Drives the
// explainer so the privacy boundary is explicit.
const PROVES = [
  "The deposit exists in the pool (and its leaf index)",
  "Whether the note has been withdrawn (nullifier spent)",
  "The exact deposit & withdrawal transactions on-chain",
];
const NEVER = [
  "The amount / denomination",
  "The depositor or recipient address",
  "Your identity — no KYC, no account login",
  "Any of your other notes or balances",
];

export default function CompliancePage() {
  const [mode, setMode] = useState<Mode>("generate");
  const [selectedNote, setSelectedNote] = useState<ShieldedNote | null>(null);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [, refresh] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    syncSpentNotes().then((n) => {
      if (n > 0) refresh();
    });
  }, []);

  const notes = typeof window !== "undefined" ? getNotes() : [];

  function pickNote(note: ShieldedNote, persist: boolean) {
    if (persist) saveNoteIfNew(note);
    setSelectedNote(note);
    setReport(null);
  }

  async function handleRun() {
    if (!selectedNote) return;
    setIsLoading(true);
    setReport(null);
    try {
      const r = await buildComplianceReport(selectedNote);
      setReport(r);
      if (!r.depositConfirmed) {
        toast(
          "Heads up: this deposit wasn't found in the current pool. Your note might belong to an older or different pool.",
          "info",
        );
      }
    } catch (err) {
      toast(friendlyError(err), "error");
    } finally {
      setIsLoading(false);
    }
  }

  function copyNote() {
    if (!report) return;
    void navigator.clipboard?.writeText(report.note);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadPdf() {
    if (!report) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(reportHtml(report));
    w.document.close();
    w.focus();
    w.print();
  }

  function downloadTxt() {
    if (!report) return;
    const blob = new Blob([formatReportText(report)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dshield-compliance-${report.commitment.slice(2, 14)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      {/* Mode toggle */}
      <div className="mt-8 grid grid-cols-2 gap-2">
        <SelectButton
          selected={mode === "generate"}
          onClick={() => {
            setMode("generate");
            setReport(null);
            setSelectedNote(null);
          }}
          disabled={isLoading}
          className="text-center font-medium"
        >
          Generate Report
        </SelectButton>
        <SelectButton
          selected={mode === "verify"}
          onClick={() => {
            setMode("verify");
            setReport(null);
            setSelectedNote(null);
          }}
          disabled={isLoading}
          className="text-center font-medium"
        >
          Verify a Report
        </SelectButton>
      </div>

      <div className="mt-6 space-y-6">
        {mode === "generate" ? (
          <>
            <Card>
              <h3 className="text-sm font-medium text-zinc-400">
                Select one of your Notes ({notes.length})
              </h3>
              {notes.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">
                  No notes on this device. Deposit first, or paste a Note below.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {notes.map((note) => (
                    <SelectButton
                      key={note.commitment}
                      selected={selectedNote?.commitment === note.commitment}
                      onClick={() => !isLoading && pickNote(note, false)}
                      disabled={isLoading}
                      className="w-full border-zinc-800 text-left hover:border-zinc-700"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-zinc-300">
                          {truncateMiddle(note.commitment, 16, 16)}
                        </span>
                        <Badge tone={note.spent ? "blue" : "green"}>
                          {note.spent ? "Withdrawn" : "In pool"}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Leaf #{note.leafIndex}
                      </div>
                    </SelectButton>
                  ))}
                </div>
              )}
            </Card>
            <NoteImport
              disabled={isLoading}
              title="Or paste a Shielded Note"
              onImport={(notes) => pickNote(notes[0], true)}
            />
          </>
        ) : (
          <NoteImport
            disabled={isLoading}
            title="Paste the Note from the report"
            onImport={(notes) => pickNote(notes[0], false)}
          />
        )}

        {selectedNote && (
          <Button fullWidth size="lg" onClick={handleRun} disabled={isLoading}>
            {isLoading
              ? "Reading chain..."
              : mode === "generate"
                ? "Generate Report"
                : "Verify Report"}
          </Button>
        )}

        {report && (
          <Card border="brand">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                {mode === "verify"
                  ? "Independently verified from chain"
                  : "Compliance Report"}
              </h3>
              <Badge tone={report.integrityOk ? "green" : "zinc"}>
                {report.integrityOk ? "Note valid" : "Note mismatch"}
              </Badge>
            </div>

            <dl className="mt-4 space-y-3 text-sm">
              <ReportRow label="Network" value={report.network} />
              <ReportRow
                label="Deposit"
                value={
                  report.depositConfirmed ? (
                    <span className="text-green-400">
                      Confirmed on-chain (leaf #{report.leafIndex})
                    </span>
                  ) : (
                    <span className="text-yellow-400">Not found on-chain</span>
                  )
                }
              />
              <ReportRow
                label="Status"
                value={
                  report.withdrawn ? (
                    <span className="text-blue-400">
                      Withdrawn (nullifier spent)
                    </span>
                  ) : (
                    <span className="text-zinc-300">In pool (unspent)</span>
                  )
                }
              />
              <ReportRow
                label="Commitment"
                value={
                  <span className="font-mono text-xs break-all text-zinc-300">
                    {report.commitment}
                  </span>
                }
              />
              <ReportRow
                label="Nullifier hash"
                value={
                  <span className="font-mono text-xs break-all text-zinc-300">
                    {report.nullifierHash}
                  </span>
                }
              />
              <ReportRow
                label="Pool contract"
                value={<ExplorerLink url={explorerContractUrl(report.poolId)} text={report.poolId} mono />}
              />
              {report.depositTx && (
                <ReportRow
                  label="Deposit tx"
                  value={
                    <ExplorerLink
                      url={explorerTxUrl(report.depositTx.hash)}
                      text={report.depositTx.hash}
                      sub={report.depositTx.at}
                      mono
                    />
                  }
                />
              )}
              {report.withdrawTx && (
                <ReportRow
                  label="Withdraw tx"
                  value={
                    <ExplorerLink
                      url={explorerTxUrl(report.withdrawTx.hash)}
                      text={report.withdrawTx.hash}
                      sub={report.withdrawTx.at}
                      mono
                    />
                  }
                />
              )}
            </dl>

            <div className="mt-5 rounded-xl bg-zinc-800/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-zinc-500">
                  Shielded Note (embedded for re-verification)
                </p>
                <button
                  type="button"
                  onClick={copyNote}
                  className="shrink-0 text-xs font-medium text-brand-400 hover:text-brand-300"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="mt-1.5 font-mono text-xs break-all text-zinc-300">
                {report.note}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="primary" onClick={downloadPdf}>
                Download PDF
              </Button>
              <Button variant="outline" onClick={downloadTxt}>
                Download .txt
              </Button>
            </div>
            <p className="mt-3 text-xs text-zinc-600">
              The exported report carries the Note. To verify, switch to the{" "}
              <span className="text-zinc-400">Verify a Report</span> tab and paste
              it — the report regenerates from chain and must match.
            </p>
          </Card>
        )}

      </div>
    </PageShell>
  );
}

function ReportRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-right sm:text-right">{value}</dd>
    </div>
  );
}

function ExplorerLink({
  url,
  text,
  sub,
  mono,
}: {
  url: string | null;
  text: string;
  sub?: string;
  mono?: boolean;
}) {
  const body = (
    <span className={mono ? "font-mono text-xs break-all" : "break-all"}>
      {text}
    </span>
  );
  return (
    <span className="inline-block">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-400 hover:text-brand-300"
        >
          {body}
        </a>
      ) : (
        <span className="text-zinc-300">{body}</span>
      )}
      {sub && <span className="block text-xs text-zinc-600">{sub}</span>}
    </span>
  );
}

// Self-contained printable HTML for the browser's "Save as PDF". Kept inline so
// the PDF needs no extra dependency. Values are hex/addresses/ISO timestamps.
function reportHtml(r: ComplianceReport): string {
  const row = (k: string, v: string) =>
    `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`;
  const txUrl = (h: string) => explorerTxUrl(h);
  const link = (h: string) => {
    const u = txUrl(h);
    return u ? `<a href="${u}">${h}</a>` : h;
  };
  const rows = [
    row("Generated", new Date(r.generatedAt).toISOString()),
    row("Network", r.network),
    row("Note integrity", r.integrityOk ? "OK — commitment matches" : "MISMATCH"),
    row(
      "Deposit",
      r.depositConfirmed
        ? `Confirmed on-chain (leaf #${r.leafIndex})`
        : "Not found on-chain",
    ),
    row("Status", r.withdrawn ? "Withdrawn (nullifier spent)" : "In pool (unspent)"),
    row("Commitment", r.commitment),
    row("Nullifier hash", r.nullifierHash),
    row("Pool contract", r.poolId),
    r.depositTx ? row("Deposit tx", link(r.depositTx.hash)) : "",
    r.withdrawTx ? row("Withdraw tx", link(r.withdrawTx.hash)) : "",
  ].join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>DShield Compliance Report</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 24px;color:#18181b}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:#71717a;font-size:13px;margin:0 0 24px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:8px 0;border-bottom:1px solid #e4e4e7;vertical-align:top}
  td.k{color:#71717a;width:160px}
  td.v{font-family:ui-monospace,monospace;word-break:break-all}
  .note{margin-top:24px;padding:12px;background:#f4f4f5;border-radius:8px;font-family:ui-monospace,monospace;font-size:12px;word-break:break-all}
  .label{font-size:11px;color:#71717a;margin-bottom:6px}
  a{color:#2563eb}
</style></head><body>
<h1>DShield Compliance Report</h1>
<p class="sub">Verifiable from the embedded Note against public on-chain data. No identity, KYC, or amount disclosed.</p>
<table>${rows}</table>
<div class="label" style="margin-top:24px">Shielded Note — paste into the Compliance Tool's “Verify a Report” tab to reproduce this report</div>
<div class="note">${r.note}</div>
</body></html>`;
}
