import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "node:path";
import { getDb } from "./client";

const migrationsFolder = join(import.meta.dir, "../../drizzle");

export function migrateDb(dbPath: string): void {
  const db = getDb(dbPath);
  migrate(db, { migrationsFolder });
}

if (import.meta.main) {
  const defaultPath = join(import.meta.dir, "../../data/sqlite.db");
  migrateDb(process.env.DATABASE_PATH ?? defaultPath);
}
