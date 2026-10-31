import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import * as schema from "./schema";

const defaultDbPath = join(import.meta.dir, "../../data/sqlite.db");

export function getDb(path?: string) {
  const dbPath = path ?? process.env.DATABASE_PATH ?? defaultDbPath;
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath, { create: true });
  return drizzle(sqlite, { schema });
}
