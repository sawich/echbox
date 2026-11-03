import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../app";
import { createSession } from "../auth/session";
import { getDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { users } from "../db/schema";
import { createGame } from "../games/service";
import { gameIconsDir, iconSourcePath, iconWebpPath } from "../games/icons";
import { createPlugin } from "../plugins/service";
import { strToU8, zipSync } from "fflate";

const iconFixturePath = join(import.meta.dir, "fixtures", "icon.png");

async function pngFile(): Promise<File> {
  const bytes = await Bun.file(iconFixturePath).arrayBuffer();
  return new File([bytes], "icon.png", { type: "image/png" });
}

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

  test("admin can create game with icon; non-admin gets 403; list is public", async () => {
    const deniedForm = new FormData();
    deniedForm.set("title", "Koikatsu");
    deniedForm.set("icon", await pngFile());

    const denied = await app.handle(
      new Request("http://localhost/api/games", {
        method: "POST",
        headers: { cookie: userCookie },
        body: deniedForm,
      }),
    );
    expect(denied.status).toBe(403);

    const form = new FormData();
    form.set("title", "Koikatsu");
    form.set("description", "KK");
    form.set("icon", await pngFile());

    const created = await app.handle(
      new Request("http://localhost/api/games", {
        method: "POST",
        headers: { cookie: adminCookie },
        body: form,
      }),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      id: string;
      slug: string;
      iconUrls: Record<string, string>;
    };
    expect(body.slug).toBe("koikatsu");
    expect(body.iconUrls["128"]).toBe(`/api/games/${body.id}/icons/128`);
    expect(existsSync(iconSourcePath(body.id, dataDir))).toBe(true);
    expect(existsSync(iconWebpPath(body.id, 128, dataDir))).toBe(true);
    expect(existsSync(gameIconsDir(body.id, dataDir))).toBe(true);

    const iconRes = await app.handle(
      new Request(`http://localhost/api/games/${body.id}/icons/128`),
    );
    expect(iconRes.status).toBe(200);
    expect(iconRes.headers.get("content-type")).toContain("image/webp");

    const listed = await app.handle(new Request("http://localhost/api/games"));
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as {
      games: { id: string; iconUrls: { "128": string } }[];
    };
    const row = listBody.games.find((g) => g.id === body.id);
    expect(row?.iconUrls["128"]).toBe(`/api/games/${body.id}/icons/128`);
  });

  test("create without icon is rejected", async () => {
    const form = new FormData();
    form.set("title", "No Icon");

    const res = await app.handle(
      new Request("http://localhost/api/games", {
        method: "POST",
        headers: { cookie: adminCookie },
        body: form,
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("admin can patch title and optionally replace icon", async () => {
    const createForm = new FormData();
    createForm.set("title", "Old Title");
    createForm.set("icon", await pngFile());
    const created = await app.handle(
      new Request("http://localhost/api/games", {
        method: "POST",
        headers: { cookie: adminCookie },
        body: createForm,
      }),
    );
    expect(created.status).toBe(201);
    const game = (await created.json()) as { id: string };

    const metaForm = new FormData();
    metaForm.set("title", "New Title");
    metaForm.set("description", "Updated");
    const patched = await app.handle(
      new Request(`http://localhost/api/games/${game.id}`, {
        method: "PATCH",
        headers: { cookie: adminCookie },
        body: metaForm,
      }),
    );
    expect(patched.status).toBe(200);
    const metaBody = (await patched.json()) as {
      title: string;
      description: string | null;
    };
    expect(metaBody.title).toBe("New Title");
    expect(metaBody.description).toBe("Updated");

    const iconForm = new FormData();
    iconForm.set("title", "New Title");
    iconForm.set("icon", await pngFile());
    const withIcon = await app.handle(
      new Request(`http://localhost/api/games/${game.id}`, {
        method: "PATCH",
        headers: { cookie: adminCookie },
        body: iconForm,
      }),
    );
    expect(withIcon.status).toBe(200);
    expect(existsSync(iconSourcePath(game.id, dataDir))).toBe(true);

    const denied = await app.handle(
      new Request(`http://localhost/api/games/${game.id}`, {
        method: "PATCH",
        headers: { cookie: userCookie },
        body: metaForm,
      }),
    );
    expect(denied.status).toBe(403);
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
