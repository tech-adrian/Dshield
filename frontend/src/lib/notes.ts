export interface ShieldedNote {
  nullifier: string;
  secret: string;
  commitment: string;
  leafIndex: number;
  spent: boolean;
  createdAt: number;
}

const STORAGE_KEY = "dshield_notes";

export function saveNote(note: ShieldedNote): void {
  const notes = getNotes();
  notes.push(note);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
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

export function generateRandomField(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "00" + hex;
}
