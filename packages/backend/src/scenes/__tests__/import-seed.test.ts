import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { users } from "../../db/schema";
import { loadSeed } from "../../gallery/seed";
import { seedTestGame } from "../../__tests__/test-game";
import {
  ECHBOX_SYSTEM_USER,
  ensureEchboxUser,
  importSeedScenes,
} from "../import-seed";
import { listScenes } from "../service";

const SCENE_SEED_COUNT = loadSeed().filter((c) => c.type === "scene").length;

describe("import seed scenes", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-scene-seed-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;
    migrateDb(dbPath);
  });

  afterEach(() => {
    delete process.env.DATABASE_PATH;
    delete process.env.DATA_DIR;
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("ensureEchboxUser upserts the system echbox user", () => {
    const first = ensureEchboxUser(dbPath);
    expect(first.id).toBe(ECHBOX_SYSTEM_USER.id);
    expect(first.discordId).toBe("system:echbox");
    expect(first.username).toBe("echbox");

    const db = getDb(dbPath);
    expect(db.select().from(users).all()).toHaveLength(1);

    const second = ensureEchboxUser(dbPath);
    expect(second.id).toBe(ECHBOX_SYSTEM_USER.id);
    expect(db.select().from(users).all()).toHaveLength(1);
  });

  test("importSeedScenes imports seed scenes for echbox then skips on re-run", async () => {
    expect(SCENE_SEED_COUNT).toBeGreaterThan(0);

    const user = ensureEchboxUser(dbPath);
    const gameId = seedTestGame(user.id, { dbPath }).id;

    const first = await importSeedScenes({ dbPath, dataDir, gameId });
    expect(first.imported).toBe(SCENE_SEED_COUNT);
    expect(first.skipped).toBe(0);

    const scenes = (await listScenes({ dbPath, dataDir })).items;
    expect(scenes).toHaveLength(SCENE_SEED_COUNT);
    for (const scene of scenes) {
      expect(scene.authorId).toBe(ECHBOX_SYSTEM_USER.id);
      expect(scene.gameId).toBe(gameId);
    }

    const second = await importSeedScenes({ dbPath, dataDir, gameId });
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(SCENE_SEED_COUNT);
    expect((await listScenes({ dbPath, dataDir })).items).toHaveLength(SCENE_SEED_COUNT);
  });
});
