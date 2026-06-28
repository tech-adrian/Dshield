export interface ShieldedNote {
  nullifier: string;
  secret: string;
  commitment: string;
  leafIndex: number;
  amount: string;
  spent: boolean;
  createdAt: number;
  poolId?: string;
}

const STORAGE_KEY = "dshield_notes";

export function saveNote(note: ShieldedNote): void {
  const notes = getNotes();
  notes.push(note);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

/**
 * Save a note only if no note with the same commitment is already stored.
 * Used when importing a pasted note so re-importing doesn't create duplicates.
 * Returns true if the note was newly added.
 */
export function saveNoteIfNew(note: ShieldedNote): boolean {
  const notes = getNotes();
  if (notes.some((n) => n.commitment === note.commitment)) return false;
  notes.push(note);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  return true;
}

export function getNotes(): ShieldedNote[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}

export function markNoteSpent(commitment: string): void {
  const notes = getNotes();
  const updated = notes.map((n) =>
    n.commitment === commitment ? { ...n, spent: true } : n,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function getActiveNotes(): ShieldedNote[] {
  return getNotes().filter((n) => !n.spent);
}

const NOTE_PREFIX = "dshield";
const NOTE_VERSION = "v1";

/**
 * Serialize a note into a single self-contained backup string. This is the
 * secret a user must keep to withdraw — analogous to a Tornado "note". Every
 * field is dash-free (hex, integers, or a Stellar C-address), so a simple
 * dash join round-trips cleanly:
 *   dshield-v1-<poolId>-<leafIndex>-<amount>-<commitment>-<nullifier>-<secret>
 */
export function serializeNote(note: ShieldedNote): string {
  return [
    NOTE_PREFIX,
    NOTE_VERSION,
    note.poolId ?? "",
    note.leafIndex,
    note.amount,
    note.commitment,
    note.nullifier,
    note.secret,
  ].join("-");
}

/** Inverse of {@link serializeNote}. Returns null if the string isn't a valid v1 note. */
export function parseNote(serialized: string): ShieldedNote | null {
  const parts = serialized.trim().split("-");
  if (parts.length !== 8) return null;
  const [prefix, version, poolId, leafIndex, amount, commitment, nullifier, secret] =
    parts;
  if (prefix !== NOTE_PREFIX || version !== NOTE_VERSION) return null;
  if (!commitment || !nullifier || !secret) return null;
  return {
    nullifier,
    secret,
    commitment,
    leafIndex: Number(leafIndex),
    amount,
    spent: false,
    createdAt: Date.now(),
    poolId: poolId || undefined,
  };
}

export function generateNoteLink(note: ShieldedNote): string {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://dshield.vercel.app";
  return `${base}/withdraw#note=${encodeURIComponent(serializeNote(note))}`;
}

export function generateRandomField(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "00" + hex;
}
