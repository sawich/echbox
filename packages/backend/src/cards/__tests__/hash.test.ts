import { describe, expect, test } from "bun:test";
import { sha256Hex } from "../hash";

describe("sha256Hex", () => {
  test("sha256Hex is stable 64 hex", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
