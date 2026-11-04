import { describe, expect, test } from "bun:test";
import {
  CHUNK_SIZE_BYTES,
  packOriginal,
  splitChunks,
  unpackOriginal,
} from "../archive";

describe("proxy archive", () => {
  test("packOriginal round-trips via unpackOriginal", () => {
    const original = new TextEncoder().encode("hello proxy archive");
    const archive = packOriginal(original);
    expect(unpackOriginal(archive)).toEqual(original);
  });

  test("splitChunks on exact chunk size yields one part", () => {
    const archive = new Uint8Array(CHUNK_SIZE_BYTES);
    const parts = splitChunks(archive);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.length).toBe(CHUNK_SIZE_BYTES);
  });

  test("splitChunks on chunk size plus one yields two parts with correct lengths", () => {
    const archive = new Uint8Array(CHUNK_SIZE_BYTES + 1);
    const parts = splitChunks(archive);
    expect(parts).toHaveLength(2);
    expect(parts[0]!.length).toBe(CHUNK_SIZE_BYTES);
    expect(parts[1]!.length).toBe(1);
  });
});
