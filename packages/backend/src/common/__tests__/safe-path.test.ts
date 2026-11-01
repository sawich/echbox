import { describe, expect, test } from "bun:test";
import { isSafeStorageId, resolveWithin } from "../safe-path";
import { assertNonEmptyZip } from "../zip";
import { strToU8, zipSync } from "fflate";

describe("isSafeStorageId", () => {
  test("accepts safe ids", () => {
    for (const id of ["a", "com.foo.bar", "Mod_1-2", crypto.randomUUID()]) {
      expect(isSafeStorageId(id)).toBe(true);
    }
  });
  test("rejects hostile ids", () => {
    for (const id of ["", ".", "..", "../..", "a/b", "a\\b", "/abs", "a..b", "a\0b"]) {
      expect(isSafeStorageId(id)).toBe(false);
    }
  });
});

describe("resolveWithin", () => {
  test("allows nested paths", () => {
    expect(resolveWithin("/data/softmods", "/data/softmods/a/b")).toBe(
      "/data/softmods/a/b",
    );
  });
  test("rejects root itself, parents and siblings", () => {
    expect(() => resolveWithin("/data/softmods", "/data/softmods")).toThrow();
    expect(() => resolveWithin("/data/softmods", "/data")).toThrow();
    expect(() => resolveWithin("/data/softmods", "/data/softmods-evil/x")).toThrow();
    expect(() => resolveWithin("/data/softmods", "/data/softmods/../x")).toThrow();
  });
});

describe("assertNonEmptyZip", () => {
  test("accepts a zip with an entry", () => {
    expect(() => assertNonEmptyZip(zipSync({ "a.txt": strToU8("x") }))).not.toThrow();
  });
  test("rejects empty, non-zip, truncated and entry-less zips", () => {
    expect(() => assertNonEmptyZip(new Uint8Array())).toThrow(/empty/i);
    expect(() => assertNonEmptyZip(strToU8("<html></html>"))).toThrow(/zip/i);
    expect(() =>
      assertNonEmptyZip(zipSync({ "a.txt": strToU8("x") }).slice(0, 20)),
    ).toThrow(/zip/i);
    expect(() => assertNonEmptyZip(zipSync({}))).toThrow();
  });
});
