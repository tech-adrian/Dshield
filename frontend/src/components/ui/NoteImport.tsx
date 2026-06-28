"use client";

import { useState } from "react";
import { parseNote, type ShieldedNote } from "@/lib/notes";
import { useToast } from "./Toast";
import { Card } from "./Card";
import { Input } from "./Input";

export function NoteImport({
  onImport,
  disabled,
  title = "Paste a Shielded Note",
}: {
  onImport: (note: ShieldedNote) => void;
  disabled?: boolean;
  title?: string;
}) {
  const [value, setValue] = useState("");
  const { toast } = useToast();

  function handleChange(raw: string) {
    const trimmed = raw.trim();
    setValue(trimmed);

    if (!trimmed.startsWith("dshield")) return;

    const note = parseNote(trimmed);
    if (note) {
      setValue("");
      onImport(note);
      toast("Note loaded — ready to use.", "success");
    } else if (trimmed.split("-").length >= 8) {
      toast(
        "Couldn't read that note — make sure you pasted the complete dshield-v1-… string.",
        "error",
      );
    }
  }

  return (
    <Card>
      <h3 className="text-sm font-medium text-zinc-400">{title}</h3>
      <p className="mt-1 text-xs text-zinc-500">
        On a new device, or don&apos;t see your note above? Paste the{" "}
        <code className="text-zinc-400">dshield-v1-…</code> backup — it loads
        automatically.
      </p>
      <div className="mt-3">
        <Input
          mono
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="dshield-v1-..."
          disabled={disabled}
        />
      </div>
    </Card>
  );
}
