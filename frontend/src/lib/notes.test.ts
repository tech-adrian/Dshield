import { describe, it, expect } from "vitest";
import {
  saveNote,
  getNotes,
  markNoteSpent,
  getActiveNotes,
  generateRandomField,
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
