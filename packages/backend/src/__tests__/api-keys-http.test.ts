import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../app";
import { createApiKey, revokeApiKey } from "../api-keys/service";
import { createSession } from "../auth/session";
import { getDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { users } from "../db/schema";
import { fixtureBytes } from "../kkloader/__tests__/helpers";
import { seedTestGame } from "./test-game";

describe("API keys HTTP + Bearer upload", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let userId: string;
  let gameId: string;
  let sessionCookie: string;

  const origDbPath = process.env.DATABASE_PATH;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-api-keys-http-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    Bun.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;
    Bun.env.DATA_DIR = dataDir;

    migrateDb(dbPath);
    userId = crypto.randomUUID();
    getDb(dbPath)
      .insert(users)
      .values({
        id: userId,
        discordId: "discord-api-keys-http",
        username: "api_user",
        avatar: null,
        createdAt: new Date().toISOString(),
      })
      .run();

    gameId = seedTestGame(userId, { dbPath }).id;
    const sess = await createSession(userId, dbPath);
    sessionCookie = sess.cookie.split(";")[0]!;
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
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("session can create list revoke keys; Bearer cannot manage keys", async () => {
    const createRes = await app.handle(
      new Request("http://localhost/api/me/api-keys", {
        method: "POST",
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "CI" }),
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      key: string;
      name: string;
    };
    expect(created.key.startsWith("ebx_")).toBe(true);

    const listRes = await app.handle(
      new Request("http://localhost/api/me/api-keys", {
        headers: { cookie: sessionCookie },
      }),
    );
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { keys: { id: string }[] };
    expect(listed.keys.some((k) => k.id === created.id)).toBe(true);

    const bearerList = await app.handle(
      new Request("http://localhost/api/me/api-keys", {
        headers: { authorization: `Bearer ${created.key}` },
      }),
    );
    expect(bearerList.status).toBe(401);

    const delRes = await app.handle(
      new Request(`http://localhost/api/me/api-keys/${created.id}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
    );
    expect(delRes.status).toBe(200);
  });

  test("Bearer uploads a card; revoked key gets 401", async () => {
    const { key, id: keyId } = createApiKey({
      userId,
      name: "Upload",
      dbPath,
    });

    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const form = new FormData();
    form.append("semver", "1.0.0");
    form.append("gameId", gameId);
    form.append(
      "file",
      new File([fileBytes], "kk_chara.png", { type: "image/png" }),
    );

    const okRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
        body: form,
      }),
    );
    expect(okRes.status).toBe(201);
    const body = (await okRes.json()) as { authorId: string; title: string };
    expect(body.authorId).toBe(userId);
    expect(body.title.length).toBeGreaterThan(0);

    revokeApiKey({ userId, keyId, dbPath });

    const form2 = new FormData();
    form2.append("semver", "1.0.1");
    form2.append("gameId", gameId);
    form2.append(
      "file",
      new File([fileBytes], "kk_chara.png", { type: "image/png" }),
    );
    // Different content needed for hash uniqueness — use notes-only change won't work.
    // Upload same file → 409 if still authenticated, or 401 if revoked.
    const badRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
        body: form2,
      }),
    );
    expect(badRes.status).toBe(401);
  });
});
