import { UserProfileSchema } from "@echbox/shared";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { app } from "../app";
import { createSession } from "../auth/session";
import { getDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { users } from "../db/schema";
import { fixtureBytes } from "../kkloader/__tests__/helpers";
import { seedTestGame } from "./test-game";

describe("user profile", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let gameId: string;
  let voterId: string;
  let authorCookie: string;
  let voterCookie: string;

  const origDbPath = process.env.DATABASE_PATH;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-users-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    Bun.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;
    Bun.env.DATA_DIR = dataDir;

    migrateDb(dbPath);
    const db = getDb(dbPath);

    authorId = crypto.randomUUID();
    voterId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(users)
      .values([
        {
          id: authorId,
          discordId: "discord-profile-author",
          username: "profile_author",
          avatar: "https://cdn.example/a.png",
          createdAt: now,
        },
        {
          id: voterId,
          discordId: "discord-profile-voter",
          username: "profile_voter",
          avatar: null,
          createdAt: now,
        },
      ])
      .run();

    gameId = seedTestGame(authorId, { dbPath }).id;

    authorCookie = (await createSession(authorId, dbPath)).cookie.split(";")[0]!;
    voterCookie = (await createSession(voterId, dbPath)).cookie.split(";")[0]!;
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

  test("GET /api/users/:id returns 404 for unknown user", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/users/does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  test("GET /api/users/:id returns profile with upload stats and cards", async () => {
    const emptyRes = await app.handle(
      new Request(`http://localhost/api/users/${authorId}`),
    );
    expect(emptyRes.status).toBe(200);
    const empty = (await emptyRes.json()) as {
      id: string;
      username: string;
      avatar: string | null;
      createdAt: string;
      stats: {
        uploadCount: number;
        likesReceived: number;
        dislikesReceived: number;
      };
      cards: unknown[];
    };
    expect(empty.id).toBe(authorId);
    expect(empty.username).toBe("profile_author");
    expect(empty.avatar).toBe("https://cdn.example/a.png");
    expect(empty.stats).toEqual({
      uploadCount: 0,
      likesReceived: 0,
      dislikesReceived: 0,
    });
    expect(empty.cards).toEqual([]);
    expect(empty).toMatchObject({
      plugins: [],
      softmods: [],
      scenes: [],
      clothes: [],
    });

    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const form = new FormData();
    form.append("gameId", gameId);
    form.append("semver", "1.0.0");
    form.append(
      "file",
      new File([fileBytes], "kk_chara.png", { type: "image/png" }),
    );
    form.append("description", "Profile Card");
    const createRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}/vote`, {
        method: "PUT",
        headers: {
          cookie: voterCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ vote: "like" }),
      }),
    );

    const profileRes = await app.handle(
      new Request(`http://localhost/api/users/${authorId}`),
    );
    expect(profileRes.status).toBe(200);
    const profileBody = await profileRes.json();
    const profile = profileBody as {
      stats: {
        uploadCount: number;
        likesReceived: number;
        dislikesReceived: number;
      };
      cards: { id: string; description: string; likes: number }[];
    };
    expect(UserProfileSchema.safeParse(profileBody).success).toBe(true);
    expect(profile.stats).toEqual({
      uploadCount: 1,
      likesReceived: 1,
      dislikesReceived: 0,
    });
    expect(profile.cards).toHaveLength(1);
    expect(profile.cards[0]!.id).toBe(created.id);
    expect(profile.cards[0]!.description).toBe("Profile Card");
    expect(profile.cards[0]!.likes).toBe(1);
  });

  test("profile aggregates cards, plugins, and softmods with combined vote stats", async () => {
    const cardBytes = await fixtureBytes("chara", "kk_chara.png");
    const cardForm = new FormData();
    cardForm.append("gameId", gameId);
    cardForm.append("semver", "1.0.0");
    cardForm.append(
      "file",
      new File([cardBytes], "kk_chara.png", { type: "image/png" }),
    );
    cardForm.append("description", "Combined Card");
    const cardRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: cardForm,
      }),
    );
    expect(cardRes.status).toBe(201);
    const card = (await cardRes.json()) as { id: string };

    const pluginBytes = zipSync({
      "data.txt": strToU8(`profile-plugin-${authorId}`),
    });
    const pluginForm = new FormData();
    pluginForm.append(
      "file",
      new File([pluginBytes], "plugin.zip", { type: "application/zip" }),
    );
    pluginForm.append("title", "Profile Plugin");
    pluginForm.append("gameId", gameId);
    pluginForm.append("semver", "1.0.0");
    const pluginRes = await app.handle(
      new Request("http://localhost/api/plugins", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: pluginForm,
      }),
    );
    expect(pluginRes.status).toBe(201);
    const plugin = (await pluginRes.json()) as { id: string };

    const softmodBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const softmodForm = new FormData();
    softmodForm.append(
      "file",
      new File([softmodBytes], "testmod.zipmod", {
        type: "application/zip",
      }),
    );
    softmodForm.append("gameId", gameId);
    softmodForm.append("semver", "1.0.0");
    const softmodRes = await app.handle(
      new Request("http://localhost/api/softmods", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: softmodForm,
      }),
    );
    expect(softmodRes.status).toBe(201);
    const softmod = (await softmodRes.json()) as { id: string };

    for (const target of [
      { path: `/api/kk/cards/${card.id}/vote` },
      { path: `/api/plugins/${plugin.id}/vote` },
      { path: `/api/softmods/${softmod.id}/vote` },
    ]) {
      await app.handle(
        new Request(`http://localhost${target.path}`, {
          method: "PUT",
          headers: {
            cookie: voterCookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({ vote: "like" }),
        }),
      );
    }

    const profileRes = await app.handle(
      new Request(`http://localhost/api/users/${authorId}`),
    );
    expect(profileRes.status).toBe(200);
    const body = await profileRes.json();
    const parsed = UserProfileSchema.parse(body);

    expect(parsed.stats.uploadCount).toBe(3);
    expect(parsed.stats.likesReceived).toBe(3);
    expect(parsed.stats.dislikesReceived).toBe(0);
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.plugins).toHaveLength(1);
    expect(parsed.softmods).toHaveLength(1);
    expect(parsed.plugins[0]!.id).toBe(plugin.id);
    expect(parsed.plugins[0]!.title).toBe("Profile Plugin");
    expect(parsed.plugins[0]!.likes).toBe(1);
    expect(parsed.softmods[0]!.id).toBe(softmod.id);
    expect(parsed.softmods[0]!.likes).toBe(1);
    expect(parsed.softmods[0]!.uploader.id).toBe(authorId);
    expect(parsed.softmods[0]!.latestSemver.length).toBeGreaterThan(0);
    expect(parsed.softmods[0]).not.toHaveProperty("packageVersion");
  });

  test("profile includes author scenes in scenes list and aggregated stats", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const form = new FormData();
    form.append("gameId", gameId);
    form.append("semver", "1.0.0");
    form.append(
      "file",
      new File([fileBytes], "kk_scene_simple.png", { type: "image/png" }),
    );
    form.append("description", "Profile Scene");
    const createRes = await app.handle(
      new Request("http://localhost/api/scenes", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    await app.handle(
      new Request(`http://localhost/api/scenes/${created.id}/vote`, {
        method: "PUT",
        headers: {
          cookie: voterCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ vote: "like" }),
      }),
    );

    const profileRes = await app.handle(
      new Request(`http://localhost/api/users/${authorId}`),
    );
    expect(profileRes.status).toBe(200);
    const body = await profileRes.json();
    const parsed = UserProfileSchema.parse(body);

    expect(parsed.stats.uploadCount).toBe(1);
    expect(parsed.stats.likesReceived).toBe(1);
    expect(parsed.stats.dislikesReceived).toBe(0);
    expect(parsed.scenes).toHaveLength(1);
    expect(parsed.scenes[0]!.id).toBe(created.id);
    expect(parsed.scenes[0]!.description).toBe("Profile Scene");
    expect(parsed.scenes[0]!.type).toBe("scene");
    expect(parsed.scenes[0]!.likes).toBe(1);
  });

  test("profile includes author clothes in clothes list and aggregated stats", async () => {
    const fileBytes = await fixtureBytes("clothes", "kk_clothes.png");
    const form = new FormData();
    form.append("gameId", gameId);
    form.append("semver", "1.0.0");
    form.append(
      "file",
      new File([fileBytes], "kk_clothes.png", { type: "image/png" }),
    );
    form.append("description", "Profile Outfit");
    const createRes = await app.handle(
      new Request("http://localhost/api/clothes", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    await app.handle(
      new Request(`http://localhost/api/clothes/${created.id}/vote`, {
        method: "PUT",
        headers: {
          cookie: voterCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ vote: "like" }),
      }),
    );

    const profileRes = await app.handle(
      new Request(`http://localhost/api/users/${authorId}`),
    );
    expect(profileRes.status).toBe(200);
    const body = await profileRes.json();
    const parsed = UserProfileSchema.parse(body);

    expect(parsed.stats.uploadCount).toBe(1);
    expect(parsed.stats.likesReceived).toBe(1);
    expect(parsed.stats.dislikesReceived).toBe(0);
    expect(parsed.clothes).toHaveLength(1);
    expect(parsed.clothes[0]!.id).toBe(created.id);
    expect(parsed.clothes[0]!.description).toBe("Profile Outfit");
    expect(parsed.clothes[0]!.type).toBe("clothes");
    expect(parsed.clothes[0]!.likes).toBe(1);
  });
});
