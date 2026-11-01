import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../app";
import { createSession } from "../auth/session";
import { getDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { users } from "../db/schema";
import { createGame } from "../games/service";
import { createPlugin } from "../plugins/service";
import { strToU8, zipSync } from "fflate";

describe("Games HTTP routes", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let adminId: string;
  let userId: string;
  let adminCookie: string;
  let userCookie: string;

  const origDbPath = process.env.DATABASE_PATH;
  const origDataDir = process.env.DATA_DIR;
  const origAdmins = process.env.ADMIN_DISCORD_IDS;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-games-http-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    Bun.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;
    Bun.env.DATA_DIR = dataDir;
    process.env.ADMIN_DISCORD_IDS = "discord-admin";
    Bun.env.ADMIN_DISCORD_IDS = "discord-admin";

    migrateDb(dbPath);
    const db = getDb(dbPath);
    adminId = crypto.randomUUID();
    userId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.insert(users)
      .values([
        {
          id: adminId,
          discordId: "discord-admin",
          username: "admin",
          avatar: null,
          createdAt: now,
        },
        {
          id: userId,
          discordId: "discord-user",
          username: "user",
          avatar: null,
          createdAt: now,
        },
      ])
      .run();

    adminCookie = (await createSession(adminId, dbPath)).cookie.split(";")[0]!;
    userCookie = (await createSession(userId, dbPath)).cookie.split(";")[0]!;
  });

  afterEach(() => {
    if (origDbPath === undefined) {
      delete process.env.DATABASE_PATH;
      delete Bun.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = origDbPath;
      Bun.env.DATABASE_PATH = origDbPath;
    }
    if (origDataDir === undefined) {
      delete process.env.DATA_DIR;
      delete Bun.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = origDataDir;
      Bun.env.DATA_DIR = origDataDir;
    }
    if (origAdmins === undefined) {
      delete process.env.ADMIN_DISCORD_IDS;
      delete Bun.env.ADMIN_DISCORD_IDS;
    } else {
      process.env.ADMIN_DISCORD_IDS = origAdmins;
      Bun.env.ADMIN_DISCORD_IDS = origAdmins;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("admin can create game; non-admin gets 403; list is public", async () => {
    const denied = await app.handle(
      new Request("http://localhost/api/games", {
        method: "POST",
        headers: {
          cookie: userCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Koikatsu" }),
      }),
    );
    expect(denied.status).toBe(403);

    const created = await app.handle(
      new Request("http://localhost/api/games", {
        method: "POST",
        headers: {
          cookie: adminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Koikatsu", description: "KK" }),
      }),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string; slug: string };
    expect(body.slug).toBe("koikatsu");

    const listed = await app.handle(new Request("http://localhost/api/games"));
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as { games: { id: string }[] };
    expect(listBody.games.some((g) => g.id === body.id)).toBe(true);
  });

  test("delete blocked while content exists", async () => {
    const game = createGame({
      title: "Honey Select 2",
      createdByUserId: adminId,
      dbPath,
    });

    await createPlugin({
      authorId: userId,
      gameId: game.id,
      title: "Content",
      fileBytes: zipSync({ "data.txt": strToU8("x") }),
      dbPath,
      dataDir,
    });

    const res = await app.handle(
      new Request(`http://localhost/api/games/${game.id}`, {
        method: "DELETE",
        headers: { cookie: adminCookie },
      }),
    );
    expect(res.status).toBe(409);
  });
});
