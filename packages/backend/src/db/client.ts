import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import * as schema from "./schema";

const defaultDbPath = join(import.meta.dir, "../../data/sqlite.db");
const dbCache = new Map<string, BunSQLiteDatabase<typeof schema>>();

export function getDb(path?: string) {
  const rawPath =
    path ?? Bun.env.DATABASE_PATH ?? process.env.DATABASE_PATH ?? defaultDbPath;
  const dbPath = resolve(rawPath);
  const cached = dbCache.get(dbPath);
  if (cached) {
    return cached;
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  dbCache.set(dbPath, db);
  return db;
}
