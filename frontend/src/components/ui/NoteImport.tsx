"use client";

import { useState, useRef, useCallback } from "react";
import { parseNote, type ShieldedNote } from "@/lib/notes";
import { useToast } from "./Toast";
import { Card } from "./Card";

export function NoteImport({
  onImport,
  disabled,
  title = "Import Shielded Notes",
}: {
  onImport: (notes: ShieldedNote[]) => void;
  disabled?: boolean;
  title?: string;
}) {
  const [value, setValue] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  function parseNotesFromText(text: string): ShieldedNote[] {
    return text
      .split(/[\n\r\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("dshield-v1-"))
      .map(parseNote)
      .filter((n): n is ShieldedNote => n !== null);
  }

  function importText(raw: string) {
    const notes = parseNotesFromText(raw);
    if (notes.length > 0) {
      setValue("");
      onImport(notes);
      toast(
        notes.length === 1
          ? "Note loaded — ready to use."
          : `${notes.length} notes loaded — ready to use.`,
        "success",
      );
    } else if (raw.trim().startsWith("dshield")) {
      toast(
        "Couldn't read that note — paste the complete dshield-v1-… string.",
        "error",
      );
    }
  }

  function handleChange(raw: string) {
    const trimmed = raw.trim();
    setValue(trimmed);
    if (trimmed.startsWith("dshield")) importText(trimmed);
  }

  function handleFileRead(text: string) {
    const notes = parseNotesFromText(text);
    if (notes.length === 0) {
      toast("No valid notes found in that file.", "error");
      return;
    }
    onImport(notes);
    toast(
      notes.length === 1
        ? "1 note imported from file."
        : `${notes.length} notes imported from file.`,
      "success",
    );
  }

  function handleFile(file: File) {
    if (!file.name.endsWith(".txt") && file.type !== "text/plain") {
      toast("Please select a .txt backup file.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => handleFileRead((e.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [disabled], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <Card
      className={dragging ? "border-brand-500/60 bg-brand-950/20" : ""}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <h3 className="text-sm font-medium text-zinc-400">{title}</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Paste a <code className="text-zinc-400">dshield-v1-…</code> note string,
        or import your <code className="text-zinc-400">.txt</code> backup file to
        load all notes at once.
      </p>

      <div className="mt-3 space-y-2">
        {/* Text paste input */}
        <textarea
          rows={2}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="dshield-v1-..."
          disabled={disabled}
          className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-300 placeholder-zinc-600 outline-none transition-colors focus:border-brand-500/50 disabled:opacity-50"
        />

        {/* File picker */}
        <input
          ref={fileRef}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300 disabled:pointer-events-none disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          {dragging ? "Drop file here" : "Upload backup file (.txt)"}
        </button>
      </div>
    </Card>
  );
}
