import { describe, expect, test } from "bun:test";
import { normalizeTagName } from "../normalize";

describe("normalizeTagName", () => {
  test("trims, lowercases, and replaces spaces with underscores", () => {
    expect(normalizeTagName(" Hatsune Miku ")).toBe("hatsune_miku");
  });

  test("preserves existing underscores and lowercases", () => {
    expect(normalizeTagName("Already_ok")).toBe("already_ok");
  });

  test("rejects invalid characters", () => {
    expect(() => normalizeTagName("bad!")).toThrow();
  });
});
