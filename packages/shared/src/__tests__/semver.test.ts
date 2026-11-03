import { describe, expect, test } from "bun:test";
import {
  compareSemver,
  parseSemver,
  pickLatestBySemver,
} from "../semver";

describe("semver helpers", () => {
  test("parseSemver canonicalizes valid input", () => {
    expect(parseSemver("1.2.3")).toBe("1.2.3");
    expect(parseSemver(" 1.0.0 ")).toBe("1.0.0");
  });

  test("parseSemver rejects garbage", () => {
    expect(() => parseSemver("nope")).toThrow(/Invalid semver/);
  });

  test("pickLatestBySemver ignores upload order", () => {
    const latest = pickLatestBySemver([
      { semver: "1.2.0", id: "a" },
      { semver: "1.10.0", id: "b" },
      { semver: "1.9.0", id: "c" },
    ]);
    expect(latest?.id).toBe("b");
    expect(compareSemver("1.10.0", "1.9.0")).toBeGreaterThan(0);
  });
});
