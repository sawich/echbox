import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GAME_ICON_SIZES,
  iconSourcePath,
  iconWebpPath,
  writeGameIcons,
} from "../icons";

const iconFixturePath = join(
  import.meta.dir,
  "../../__tests__/fixtures/icon.png",
);

describe("writeGameIcons", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "echbox-game-icons-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("writes source.png and sized webp files", async () => {
    const png = new Uint8Array(await Bun.file(iconFixturePath).arrayBuffer());
    const gameId = crypto.randomUUID();
    await writeGameIcons(gameId, png, dataDir);
    expect(existsSync(iconSourcePath(gameId, dataDir))).toBe(true);
    for (const size of GAME_ICON_SIZES) {
      const path = iconWebpPath(gameId, size, dataDir);
      expect(existsSync(path)).toBe(true);
      const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
      expect(bytes[0]).toBe(0x52);
      expect(bytes[8]).toBe(0x57);
    }
  });

  test("rejects non-png", async () => {
    await expect(
      writeGameIcons(crypto.randomUUID(), new Uint8Array([1, 2, 3]), dataDir),
    ).rejects.toThrow(/PNG/);
  });
});
