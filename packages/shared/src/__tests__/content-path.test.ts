import { describe, expect, test } from "bun:test";
import {
  normalizeContentRelPath,
  parseContentKindsInput,
} from "../content-path";

describe("normalizeContentRelPath", () => {
  test("empty and whitespace become null", () => {
    expect(normalizeContentRelPath("")).toBeNull();
    expect(normalizeContentRelPath("  ")).toBeNull();
    expect(normalizeContentRelPath(null)).toBeNull();
  });

  test("normalizes relative path", () => {
    expect(normalizeContentRelPath("UserData\\cards/")).toBe("UserData/cards");
  });

  test("rejects absolute and parent segments", () => {
    expect(() => normalizeContentRelPath("/etc")).toThrow();
    expect(() => normalizeContentRelPath("a/../b")).toThrow();
    expect(() => normalizeContentRelPath("C:\\mods")).toThrow();
  });
});

describe("parseContentKindsInput", () => {
  test("rejects duplicates", () => {
    expect(() =>
      parseContentKindsInput([
        { kind: "cards", relPath: null },
        { kind: "cards", relPath: "x" },
      ]),
    ).toThrow();
  });
});
