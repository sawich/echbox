import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearProxyTemp,
  getProxyTempRoot,
  withProxyTempDir,
} from "../temp";

describe("proxy temp", () => {
  let tempDir: string;
  let dataDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-proxy-temp-"));
    dataDir = join(tempDir, "data");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("getProxyTempRoot resolves under data dir", () => {
    expect(getProxyTempRoot(dataDir)).toBe(join(dataDir, "tmp", "proxy"));
  });

  test("clearProxyTemp deletes files under the root", async () => {
    const root = getProxyTempRoot(dataDir);
    mkdirSync(root, { recursive: true });
    const planted = join(root, "planted.txt");
    writeFileSync(planted, "stay gone", { flag: "w" });
    expect(existsSync(planted)).toBe(true);

    await clearProxyTemp(dataDir);

    expect(existsSync(planted)).toBe(false);
    expect(existsSync(root)).toBe(true);
  });

  test("withProxyTempDir removes its dir when fn throws", async () => {
    let usedDir = "";

    await expect(
      withProxyTempDir(async (dir) => {
        usedDir = dir;
        writeFileSync(join(dir, "work.txt"), "x");
        throw new Error("boom");
      }, dataDir),
    ).rejects.toThrow("boom");

    expect(usedDir).not.toBe("");
    expect(existsSync(usedDir)).toBe(false);
  });
});
