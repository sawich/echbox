import { migrateDb } from "../db/migrate";
import { createGame } from "../games/service";
import { ensureEchboxUser, importSeedScenes } from "./import-seed";

const dbPath = Bun.env.DATABASE_PATH ?? process.env.DATABASE_PATH;
const dataDir = Bun.env.DATA_DIR ?? process.env.DATA_DIR;
const gameIdEnv = Bun.env.SEED_GAME_ID ?? process.env.SEED_GAME_ID;

if (dbPath) {
  migrateDb(dbPath);
}

const systemUser = ensureEchboxUser(dbPath);
const gameId =
  gameIdEnv ??
  createGame({
    title: "Koikatsu",
    createdByUserId: systemUser.id,
    dbPath,
  }).id;

const result = await importSeedScenes({
  dbPath,
  dataDir,
  gameId,
});

console.log(
  `Seed scene import: ${result.imported} imported, ${result.skipped} skipped`,
);
