import * as StellarSdk from "@stellar/stellar-sdk";

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
function parseNoteV1(serialized: string): ShieldedNote | null {
  const parts = serialized.split("-");
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

// Compact binary encoding used only for shareable links (generateNoteLink) —
// the same information as serializeNote's dash-joined hex fields, packed
// into a fixed-width buffer and base64url-encoded instead. Roughly a third
// shorter, which matters when a note is pasted somewhere with a practical
// length limit (a social post, a QR code). serializeNote's format is left
// alone for the copy/paste backup textarea, where readability matters more
// than length. All bytes here are already URL/fragment-safe (base64url +
// the "." prefix separator), so no percent-encoding inflation occurs.
const COMPACT_PREFIX = "dS2.";
const COMPACT_VERSION = 2;
// version(1) + poolId(32) + leafIndex(4) + amount(8) + commitment(32) +
// nullifier(32) + secret(32)
const COMPACT_LENGTH = 1 + 32 + 4 + 8 + 32 + 32 + 32;
const ZERO_POOL_ID = Buffer.alloc(32);

function hexToBytes32(hex: string): Buffer | null {
  const clean = hex.replace(/^0x/, "");
  if (clean.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(clean)) return null;
  return Buffer.from(clean, "hex");
}

/**
 * Packs a note into the compact link format. Returns null (caller falls
 * back to the dash-joined format) if any field doesn't fit the fixed
 * widths chosen here — leafIndex up to 2^32-1 (pool trees cap at 2^20
 * leaves) and amount up to 2^64-1 (far beyond any realistic USDC tier) —
 * so a future edge case degrades to a longer link instead of breaking.
 */
function encodeNoteCompact(note: ShieldedNote): string | null {
  if (note.leafIndex < 0 || note.leafIndex > 0xffffffff) return null;
  let amountBig: bigint;
  try {
    amountBig = BigInt(note.amount);
  } catch {
    return null;
  }
  if (amountBig < BigInt(0) || amountBig > BigInt("0xffffffffffffffff")) return null;
  const commitmentBytes = hexToBytes32(note.commitment);
  const nullifierBytes = hexToBytes32(note.nullifier);
  const secretBytes = hexToBytes32(note.secret);
  if (!commitmentBytes || !nullifierBytes || !secretBytes) return null;

  let poolIdBytes: Buffer;
  if (note.poolId) {
    try {
      poolIdBytes = StellarSdk.StrKey.decodeContract(note.poolId);
    } catch {
      return null;
    }
  } else {
    poolIdBytes = ZERO_POOL_ID;
  }

  const buf = Buffer.alloc(COMPACT_LENGTH);
  let offset = 0;
  buf.writeUInt8(COMPACT_VERSION, offset);
  offset += 1;
  poolIdBytes.copy(buf, offset);
  offset += 32;
  buf.writeUInt32BE(note.leafIndex, offset);
  offset += 4;
  buf.writeBigUInt64BE(amountBig, offset);
  offset += 8;
  commitmentBytes.copy(buf, offset);
  offset += 32;
  nullifierBytes.copy(buf, offset);
  offset += 32;
  secretBytes.copy(buf, offset);

  return COMPACT_PREFIX + buf.toString("base64url");
}

function decodeNoteCompact(payload: string): ShieldedNote | null {
  let buf: Buffer;
  try {
    buf = Buffer.from(payload, "base64url");
  } catch {
    return null;
  }
  if (buf.length !== COMPACT_LENGTH || buf.readUInt8(0) !== COMPACT_VERSION) return null;

  let offset = 1;
  const poolIdBytes = buf.subarray(offset, offset + 32);
  offset += 32;
  const leafIndex = buf.readUInt32BE(offset);
  offset += 4;
  const amount = buf.readBigUInt64BE(offset).toString();
  offset += 8;
  const commitment = buf.subarray(offset, offset + 32).toString("hex");
  offset += 32;
  const nullifier = buf.subarray(offset, offset + 32).toString("hex");
  offset += 32;
  const secret = buf.subarray(offset, offset + 32).toString("hex");

  const poolId = poolIdBytes.equals(ZERO_POOL_ID)
    ? undefined
    : StellarSdk.StrKey.encodeContract(Buffer.from(poolIdBytes));

  return {
    nullifier,
    secret,
    commitment,
    leafIndex,
    amount,
    spent: false,
    createdAt: Date.now(),
    poolId,
  };
}

/** Inverse of both {@link serializeNote} and the compact link format. Returns null if the string is neither. */
export function parseNote(serialized: string): ShieldedNote | null {
  const trimmed = serialized.trim();
  if (trimmed.startsWith(COMPACT_PREFIX)) {
    return decodeNoteCompact(trimmed.slice(COMPACT_PREFIX.length));
  }
  return parseNoteV1(trimmed);
}

export function generateNoteLink(note: ShieldedNote): string {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://dshield.vercel.app";
  const compact = encodeNoteCompact(note);
  const payload = compact ?? serializeNote(note);
  return `${base}/withdraw#note=${encodeURIComponent(payload)}`;
}

export function generateRandomField(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "00" + hex;
}
