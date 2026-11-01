import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../app";
import { createSession } from "../auth/session";
import { sha256Hex } from "../cards/hash";
import { getDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { users } from "../db/schema";
import { fixtureBytes } from "../kkloader/__tests__/helpers";

describe("Scene HTTP routes", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let otherUserId: string;
  let authorCookie: string;
  let otherCookie: string;

  const origDbPath = process.env.DATABASE_PATH;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-scenes-http-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    Bun.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;
    Bun.env.DATA_DIR = dataDir;

    migrateDb(dbPath);
    const db = getDb(dbPath);

    authorId = crypto.randomUUID();
    otherUserId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(users)
      .values([
        {
          id: authorId,
          discordId: "discord-scene-http-author",
          username: "scene_author",
          avatar: null,
          createdAt: now,
        },
        {
          id: otherUserId,
          discordId: "discord-scene-http-other",
          username: "other_user",
          avatar: null,
          createdAt: now,
        },
      ])
      .run();

    const authorSess = await createSession(authorId, dbPath);
    authorCookie = authorSess.cookie.split(";")[0]!;

    const otherSess = await createSession(otherUserId, dbPath);
    otherCookie = otherSess.cookie.split(";")[0]!;
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

  test("GET /api/scenes is empty initially, then lists created scene", async () => {
    const emptyRes = await app.handle(
      new Request("http://localhost/api/scenes"),
    );
    expect(emptyRes.status).toBe(200);
    const emptyBody = (await emptyRes.json()) as { scenes: unknown[] };
    expect(emptyBody.scenes).toEqual([]);

    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "kk_scene_simple.png", { type: "image/png" }),
    );
    form.append("title", "HTTP Studio");
    form.append("notes", "v1 upload");

    const createRes = await app.handle(
      new Request("http://localhost/api/scenes", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      title: string;
      latestVersion: number;
      authorId: string;
      type: string;
    };
    expect(created.id).toBeString();
    expect(created.title).toBe("HTTP Studio");
    expect(created.latestVersion).toBe(1);
    expect(created.authorId).toBe(authorId);
    expect(created.type).toBe("scene");

    const listRes = await app.handle(
      new Request("http://localhost/api/scenes"),
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      scenes: { id: string; title: string; imageUrl: string; type: string }[];
    };
    expect(listBody.scenes).toHaveLength(1);
    expect(listBody.scenes[0]!.id).toBe(created.id);
    expect(listBody.scenes[0]!.type).toBe("scene");
    expect(listBody.scenes[0]!.imageUrl).toBe(
      `/api/scenes/${created.id}/versions/1/image`,
    );
  });

  test("POST /api/scenes requires auth (401)", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "kk_scene_simple.png", { type: "image/png" }),
    );

    const res = await app.handle(
      new Request("http://localhost/api/scenes", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(401);
  });

  test("POST /api/scenes rejects duplicate content hash with 409", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");

    const form1 = new FormData();
    form1.append(
      "file",
      new File([fileBytes], "kk_scene_simple.png", { type: "image/png" }),
    );
    const res1 = await app.handle(
      new Request("http://localhost/api/scenes", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form1,
      }),
    );
    expect(res1.status).toBe(201);
    const created = (await res1.json()) as { id: string };

    const form2 = new FormData();
    form2.append(
      "file",
      new File([fileBytes], "kk_scene_simple.png", { type: "image/png" }),
    );
    const res2 = await app.handle(
      new Request("http://localhost/api/scenes", {
        method: "POST",
        headers: { cookie: otherCookie },
        body: form2,
      }),
    );
    expect(res2.status).toBe(409);
    const conflictBody = (await res2.json()) as {
      sceneId: string;
      version: number;
      code: string;
    };
    expect(conflictBody.code).toBe("CONFLICT");
    expect(conflictBody.sceneId).toBe(created.id);
    expect(conflictBody.version).toBe(1);
  });

  test("GET /api/scenes/by-hash/:hash returns 404 when unknown and 200 after upload", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const hash = sha256Hex(fileBytes);

    const missRes = await app.handle(
      new Request(`http://localhost/api/scenes/by-hash/${hash}`),
    );
    expect(missRes.status).toBe(404);

    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "kk_scene_simple.png", { type: "image/png" }),
    );

    const createRes = await app.handle(
      new Request("http://localhost/api/scenes", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const hitRes = await app.handle(
      new Request(`http://localhost/api/scenes/by-hash/${hash}`),
    );
    expect(hitRes.status).toBe(200);
    const hitBody = (await hitRes.json()) as {
      sceneId: string;
      version: number;
    };
    expect(hitBody.sceneId).toBe(created.id);
    expect(hitBody.version).toBe(1);
  });

  test("GET /api/scenes/:id/versions/:version/image serves WebP by default and PNG with original=1", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "kk_scene_simple.png", { type: "image/png" }),
    );

    const createRes = await app.handle(
      new Request("http://localhost/api/scenes", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const previewRes = await app.handle(
      new Request(
        `http://localhost/api/scenes/${created.id}/versions/1/image`,
      ),
    );
    expect(previewRes.status).toBe(200);
    expect(previewRes.headers.get("content-type")).toContain("image/webp");
    const previewBytes = new Uint8Array(await previewRes.arrayBuffer());
    expect(String.fromCharCode(...previewBytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...previewBytes.slice(8, 12))).toBe("WEBP");

    const origRes = await app.handle(
      new Request(
        `http://localhost/api/scenes/${created.id}/versions/1/image?original=1`,
      ),
    );
    expect(origRes.status).toBe(200);
    expect(origRes.headers.get("content-type")).toContain("image/png");
    const origBytes = new Uint8Array(await origRes.arrayBuffer());
    expect(Buffer.from(origBytes).equals(Buffer.from(fileBytes))).toBe(true);
  });

  test("PUT /api/scenes/:id/vote requires auth and updates counts", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "kk_scene_simple.png", { type: "image/png" }),
    );

    const createRes = await app.handle(
      new Request("http://localhost/api/scenes", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    const created = (await createRes.json()) as { id: string };

    const unauthVote = await app.handle(
      new Request(`http://localhost/api/scenes/${created.id}/vote`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vote: "like" }),
      }),
    );
    expect(unauthVote.status).toBe(401);

    const voteRes = await app.handle(
      new Request(`http://localhost/api/scenes/${created.id}/vote`, {
        method: "PUT",
        headers: {
          cookie: otherCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ vote: "like" }),
      }),
    );
    expect(voteRes.status).toBe(200);
    const voteBody = (await voteRes.json()) as {
      likes: number;
      myVote: string | null;
    };
    expect(voteBody.likes).toBe(1);
    expect(voteBody.myVote).toBe("like");
  });

  test("DELETE /api/scenes/:id enforces auth and author-only (401/403/200)", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "kk_scene_simple.png", { type: "image/png" }),
    );

    const createRes = await app.handle(
      new Request("http://localhost/api/scenes", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const unauthDel = await app.handle(
      new Request(`http://localhost/api/scenes/${created.id}`, {
        method: "DELETE",
      }),
    );
    expect(unauthDel.status).toBe(401);

    const forbidDel = await app.handle(
      new Request(`http://localhost/api/scenes/${created.id}`, {
        method: "DELETE",
        headers: { cookie: otherCookie },
      }),
    );
    expect(forbidDel.status).toBe(403);

    const delRes = await app.handle(
      new Request(`http://localhost/api/scenes/${created.id}`, {
        method: "DELETE",
        headers: { cookie: authorCookie },
      }),
    );
    expect(delRes.status).toBe(200);

    const afterGet = await app.handle(
      new Request(`http://localhost/api/scenes/${created.id}`),
    );
    expect(afterGet.status).toBe(404);
  });

  test("scene HTTP responses strip originalPath and previewPath from detail and versions", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "kk_scene_simple.png", { type: "image/png" }),
    );

    const createRes = await app.handle(
      new Request("http://localhost/api/scenes", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as Record<string, unknown> & {
      id: string;
      versions: Record<string, unknown>[];
    };
    expect(created.originalPath).toBeUndefined();
    expect(created.previewPath).toBeUndefined();
    expect(created.versions[0]!.originalPath).toBeUndefined();
    expect(created.versions[0]!.previewPath).toBeUndefined();

    const getRes = await app.handle(
      new Request(`http://localhost/api/scenes/${created.id}`),
    );
    expect(getRes.status).toBe(200);
    const detail = (await getRes.json()) as {
      versions: Record<string, unknown>[];
    };
    for (const v of detail.versions) {
      expect(v.originalPath).toBeUndefined();
      expect(v.previewPath).toBeUndefined();
    }
  });

  test("GET /api/kk/cards?type=scene returns empty cards after cutover", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards?type=scene"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: unknown[] };
    expect(body.cards).toEqual([]);
  });
});
