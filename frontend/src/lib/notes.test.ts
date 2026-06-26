import { describe, it, expect } from "vitest";
import {
  saveNote,
  getNotes,
  markNoteSpent,
  getActiveNotes,
  generateRandomField,
  serializeNote,
  parseNote,
  saveNoteIfNew,
  type ShieldedNote,
} from "./notes";

function makeNote(overrides: Partial<ShieldedNote> = {}): ShieldedNote {
  return {
    nullifier: "00aabbcc",
    secret: "00ddeeff",
    commitment: "abcd1234",
    leafIndex: 0,
    amount: "1000000",
    spent: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("generateRandomField", () => {
  it("produces a 64-char hex string starting with 00", () => {
    const field = generateRandomField();
    expect(field).toHaveLength(64);
    expect(field.slice(0, 2)).toBe("00");
    expect(/^[0-9a-f]{64}$/.test(field)).toBe(true);
  });

  it("produces different values on successive calls", () => {
    const a = generateRandomField();
    const b = generateRandomField();
    expect(a).not.toBe(b);
  });
});

describe("serializeNote / parseNote", () => {
  it("round-trips a note's withdrawable fields", () => {
    const note = makeNote({
      poolId: "CABC123",
      leafIndex: 7,
      amount: "10000000",
      commitment: "deadbeef",
      nullifier: "00aa",
      secret: "00bb",
    });
    const restored = parseNote(serializeNote(note));
    expect(restored).not.toBeNull();
    expect(restored!.poolId).toBe("CABC123");
    expect(restored!.leafIndex).toBe(7);
    expect(restored!.amount).toBe("10000000");
    expect(restored!.commitment).toBe("deadbeef");
    expect(restored!.nullifier).toBe("00aa");
    expect(restored!.secret).toBe("00bb");
    expect(restored!.spent).toBe(false);
  });

  it("produces a dshield-v1 prefixed string", () => {
    expect(serializeNote(makeNote())).toMatch(/^dshield-v1-/);
  });

  it("returns null for malformed or foreign strings", () => {
    expect(parseNote("not-a-note")).toBeNull();
    expect(parseNote("tornado-eth-0.1-1-0xabc")).toBeNull();
    expect(parseNote("dshield-v2-a-0-1-c-n-s")).toBeNull();
    expect(parseNote("")).toBeNull();
  });
});

describe("saveNote / getNotes", () => {
  it("returns empty array when nothing saved", () => {
    expect(getNotes()).toEqual([]);
  });

  it("saves and retrieves a note", () => {
    const note = makeNote();
    saveNote(note);
    const notes = getNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].commitment).toBe("abcd1234");
    expect(notes[0].amount).toBe("1000000");
  });

  it("appends multiple notes", () => {
    saveNote(makeNote({ commitment: "aaa" }));
    saveNote(makeNote({ commitment: "bbb" }));
    expect(getNotes()).toHaveLength(2);
  });
});

describe("saveNoteIfNew", () => {
  it("adds a note that isn't already stored", () => {
    expect(saveNoteIfNew(makeNote({ commitment: "aaa" }))).toBe(true);
    expect(getNotes()).toHaveLength(1);
  });

  it("does not duplicate a note with an existing commitment", () => {
    saveNote(makeNote({ commitment: "aaa" }));
    expect(saveNoteIfNew(makeNote({ commitment: "aaa", secret: "00ff" }))).toBe(
      false,
    );
    expect(getNotes()).toHaveLength(1);
  });
});

describe("markNoteSpent", () => {
  it("marks the correct note as spent", () => {
    saveNote(makeNote({ commitment: "aaa" }));
    saveNote(makeNote({ commitment: "bbb" }));
    markNoteSpent("aaa");
    const notes = getNotes();
    expect(notes[0].spent).toBe(true);
    expect(notes[1].spent).toBe(false);
  });

  it("does not modify notes with different commitment", () => {
    saveNote(makeNote({ commitment: "aaa" }));
    markNoteSpent("zzz");
    expect(getNotes()[0].spent).toBe(false);
  });
});

describe("getActiveNotes", () => {
  it("filters out spent notes", () => {
    saveNote(makeNote({ commitment: "aaa" }));
    saveNote(makeNote({ commitment: "bbb" }));
    markNoteSpent("aaa");
    const active = getActiveNotes();
    expect(active).toHaveLength(1);
    expect(active[0].commitment).toBe("bbb");
  });

  it("returns all notes when none are spent", () => {
    saveNote(makeNote({ commitment: "aaa" }));
    saveNote(makeNote({ commitment: "bbb" }));
    expect(getActiveNotes()).toHaveLength(2);
  });

  it("returns empty array when all are spent", () => {
    saveNote(makeNote({ commitment: "aaa" }));
    markNoteSpent("aaa");
    expect(getActiveNotes()).toHaveLength(0);
  });
});
