"use client";

import { useState } from "react";
import { parseNote, type ShieldedNote } from "@/lib/notes";
import { Card } from "./Card";
import { Button } from "./Button";
import { Input } from "./Input";

/**
 * Lets a user paste a serialized `dshield-v1-…` note string and recover the
 * underlying note — for withdrawing or proving compliance on a device where the
 * note isn't in localStorage (e.g. a fresh browser, or a note shared as a
 * backup). On success the parsed note is handed back via {@link onImport}.
 */
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
  const [error, setError] = useState("");

  function handleImport() {
    const note = parseNote(value);
    if (!note) {
      setError(
        "Invalid note. Paste the full dshield-v1-… string from your deposit backup.",
      );
      return;
    }
    setError("");
    setValue("");
    onImport(note);
  }

  return (
    <Card>
      <h3 className="text-sm font-medium text-zinc-400">{title}</h3>
      <p className="mt-1 text-xs text-zinc-500">
        On a new device, or don&apos;t see your note above? Paste the{" "}
        <code className="text-zinc-400">dshield-v1-…</code> backup you saved when
        you deposited.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <Input
            mono
            value={value}
            onChange={(e) => {
              setValue(e.target.value.trim());
              if (error) setError("");
            }}
            placeholder="dshield-v1-..."
            disabled={disabled}
          />
        </div>
        <Button
          variant="outline"
          onClick={handleImport}
          disabled={disabled || !value}
          className="shrink-0"
        >
          Use note
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Card>
  );
}
