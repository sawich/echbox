import { join } from "node:path";
import { app } from "./app";
import { migrateDb } from "./db/migrate";
import { clearProxyTemp } from "./proxy/temp";

const PORT = Number(process.env.PORT ?? 3001);
const defaultDbPath = join(import.meta.dir, "../data/sqlite.db");

migrateDb(process.env.DATABASE_PATH ?? defaultDbPath);
await clearProxyTemp();

app.listen(PORT);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

export type { App } from "./app";
