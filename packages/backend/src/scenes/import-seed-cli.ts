import { migrateDb } from "../db/migrate";
import { importSeedScenes } from "./import-seed";

const dbPath = Bun.env.DATABASE_PATH ?? process.env.DATABASE_PATH;
const dataDir = Bun.env.DATA_DIR ?? process.env.DATA_DIR;

if (dbPath) {
  migrateDb(dbPath);
}

const result = await importSeedScenes({
  dbPath,
  dataDir,
});

console.log(
  `Seed scene import: ${result.imported} imported, ${result.skipped} skipped`,
);
