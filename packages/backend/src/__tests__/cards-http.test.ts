import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../app";
import { SESSION_COOKIE_NAME, createSession } from "../auth/session";
import { sha256Hex } from "../cards/hash";
import { getDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { users } from "../db/schema";
import { fixtureBytes } from "../kkloader/__tests__/helpers";
import { seedTestGame } from "./test-game";

describe("Character CRUD + hash lookup + gallery split HTTP routes", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let gameId: string;
  let otherUserId: string;
  let authorCookie: string;
  let otherCookie: string;

  const origDbPath = process.env.DATABASE_PATH;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-cards-http-"));
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
          discordId: "discord-http-author",
          username: "author_user",
          avatar: null,
          createdAt: now,
        },
        {
          id: otherUserId,
          discordId: "discord-http-other",
          username: "other_user",
          avatar: null,
          createdAt: now,
        },
      ])
      .run();

    gameId = seedTestGame(authorId, { dbPath }).id;

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

  test("GET /api/kk/cards?type=character is empty initially, then lists created DB character", async () => {
    const emptyRes = await app.handle(
      new Request("http://localhost/api/kk/cards?type=character"),
    );
    expect(emptyRes.status).toBe(200);
    const emptyBody = (await emptyRes.json()) as { cards: unknown[] };
    expect(emptyBody.cards).toEqual([]);

    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const form = new FormData();
    form.append("semver", "1.0.0");
    form.append("gameId", gameId);
    form.append("file", new File([fileBytes], "kk_chara.png", { type: "image/png" }));
    form.append("description", "HTTP Heroine");
    form.append("notes", "v1 upload");

    const createRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      description: string;
      latestSemver: string;
      latestVersionId: string;
      uploaderId: string;
    };
    expect(created.id).toBeString();
    expect(created.description).toBe("HTTP Heroine");
    expect(created).not.toHaveProperty("title");
    expect(created.latestSemver).toBe("1.0.0");
    expect(created.latestVersionId).toBeString();
    expect(created.uploaderId).toBe(authorId);

    const listRes = await app.handle(
      new Request("http://localhost/api/kk/cards?type=character"),
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      cards: { id: string; description: string; imageUrl: string; type: string }[];
    };
    expect(listBody.cards).toHaveLength(1);
    expect(listBody.cards[0]!.id).toBe(created.id);
    expect(listBody.cards[0]!.description).toBe("HTTP Heroine");
    expect(listBody.cards[0]!.type).toBe("character");
    expect(listBody.cards[0]!.imageUrl).toBe(
      `/api/kk/cards/${created.id}/versions/${created.latestVersionId}/image`,
    );
  });

  test("GET /api/kk/cards?type=scene returns empty cards (scenes use /api/scenes)", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards?type=scene"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: unknown[] };
    expect(body.cards).toEqual([]);
  });

  test("GET /api/kk/cards/by-hash/:hash returns 404 when unknown and 200 after upload", async () => {
    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const hash = sha256Hex(fileBytes);

    const missRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/by-hash/${hash}`),
    );
    expect(missRes.status).toBe(404);

    const form = new FormData();

    form.append("semver", "1.0.0");
    form.append("gameId", gameId);
    form.append("file", new File([fileBytes], "kk_chara.png", { type: "image/png" }));

    const createRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      latestVersionId: string;
    };

    const hitRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/by-hash/${hash}`),
    );
    expect(hitRes.status).toBe(200);
    const hitBody = (await hitRes.json()) as {
      cardId: string;
      versionId: string;
      semver: string;
    };
    expect(hitBody.cardId).toBe(created.id);
    expect(hitBody.versionId).toBe(created.latestVersionId);
    expect(hitBody.semver).toBe("1.0.0");
  });

  test("POST /api/kk/cards requires auth (401) and rejects duplicate hash with 409", async () => {
    const fileBytes = await fixtureBytes("chara", "kk_chara.png");

    const unauthForm = new FormData();
    unauthForm.append("gameId", gameId);

    unauthForm.append("semver", "1.0.0");
    unauthForm.append("file", new File([fileBytes], "kk_chara.png", { type: "image/png" }));
    const unauthRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        body: unauthForm,
      }),
    );
    expect(unauthRes.status).toBe(401);

    const form1 = new FormData();

    form1.append("gameId", gameId);

    form1.append("semver", "1.0.0");
    form1.append("file", new File([fileBytes], "kk_chara.png", { type: "image/png" }));
    const res1 = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form1,
      }),
    );
    expect(res1.status).toBe(201);
    const created = (await res1.json()) as {
      id: string;
      latestVersionId: string;
    };

    const form2 = new FormData();

    form2.append("gameId", gameId);

    form2.append("semver", "1.0.0");
    form2.append("file", new File([fileBytes], "kk_chara.png", { type: "image/png" }));
    const res2 = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: otherCookie },
        body: form2,
      }),
    );
    expect(res2.status).toBe(409);
    const conflictBody = (await res2.json()) as {
      cardId: string;
      versionId: string;
      semver: string;
      conflict: { cardId: string; versionId: string; semver: string };
    };
    expect(conflictBody.cardId).toBe(created.id);
    expect(conflictBody.versionId).toBe(created.latestVersionId);
    expect(conflictBody.semver).toBe("1.0.0");
    expect(conflictBody.conflict).toEqual({
      cardId: created.id,
      versionId: created.latestVersionId,
      semver: "1.0.0",
    });
  });

  test("GET /api/kk/cards/:id/versions/:version/image serves WebP preview by default", async () => {
    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const form = new FormData();
    form.append("semver", "1.0.0");
    form.append("gameId", gameId);
    form.append("file", new File([fileBytes], "kk_chara.png", { type: "image/png" }));

    const createRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      latestVersionId: string;
    };

    const imgRes = await app.handle(
      new Request(
        `http://localhost/api/kk/cards/${created.id}/versions/${created.latestVersionId}/image`,
      ),
    );
    expect(imgRes.status).toBe(200);
    expect(imgRes.headers.get("content-type")).toContain("image/webp");
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WEBP");
  });

  test("POST versions, PATCH metadata, and DELETE enforce auth and author-only (401/403/200)", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const v2Bytes = await fixtureBytes("chara", "kk_mod_chara.png");

    const createForm = new FormData();

    createForm.append("gameId", gameId);

    createForm.append("semver", "1.0.0");
    createForm.append("file", new File([v1Bytes], "kk_chara.png", { type: "image/png" }));
    createForm.append("description", "Original Title");

    const createRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: createForm,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    // Non-author add version -> 403
    const forbidVerForm = new FormData();
    forbidVerForm.append("semver", "2.0.0");
    forbidVerForm.append("file", new File([v2Bytes], "kk_mod_chara.png", { type: "image/png" }));
    const forbidVerRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}/versions`, {
        method: "POST",
        headers: { cookie: otherCookie },
        body: forbidVerForm,
      }),
    );
    expect(forbidVerRes.status).toBe(403);

    // Author add version -> 200/201
    const verForm = new FormData();
    verForm.append("semver", "2.0.0");
    verForm.append("file", new File([v2Bytes], "kk_mod_chara.png", { type: "image/png" }));
    verForm.append("notes", "v2 notes");
    const verRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}/versions`, {
        method: "POST",
        headers: { cookie: authorCookie },
        body: verForm,
      }),
    );
    expect(verRes.status).toBe(200);
    const updatedCard = (await verRes.json()) as {
      latestSemver: string;
      latestVersionId: string;
      versions: { id: string; semver: string; notes?: string }[];
    };
    expect(updatedCard.latestSemver).toBe("2.0.0");
    expect(updatedCard.latestVersionId).toBe(updatedCard.versions[1]!.id);
    expect(updatedCard.versions).toHaveLength(2);

    const v1Id = updatedCard.versions.find((v) => v.semver === "1.0.0")!.id;
    const v2Id = updatedCard.versions.find((v) => v.semver === "2.0.0")!.id;

    // Non-author delete version -> 403
    const forbidDelVerRes = await app.handle(
      new Request(
        `http://localhost/api/kk/cards/${created.id}/versions/${v2Id}`,
        { method: "DELETE", headers: { cookie: otherCookie } },
      ),
    );
    expect(forbidDelVerRes.status).toBe(403);

    // Author delete higher version -> latest falls back to 1.0.0
    const delV2Res = await app.handle(
      new Request(
        `http://localhost/api/kk/cards/${created.id}/versions/${v2Id}`,
        { method: "DELETE", headers: { cookie: authorCookie } },
      ),
    );
    expect(delV2Res.status).toBe(200);
    const afterDelV2 = (await delV2Res.json()) as {
      latestSemver: string | null;
      latestVersionId: string | null;
      versions: { semver: string }[];
    };
    expect(afterDelV2.latestSemver).toBe("1.0.0");
    expect(afterDelV2.latestVersionId).toBe(v1Id);
    expect(afterDelV2.versions).toHaveLength(1);

    // Re-add 2.0.0 for remaining PATCH / notes assertions
    const readdV2Form = new FormData();
    readdV2Form.append("semver", "2.0.0");
    readdV2Form.append(
      "file",
      new File([v2Bytes], "kk_mod_chara.png", { type: "image/png" }),
    );
    const readdV2Res = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}/versions`, {
        method: "POST",
        headers: { cookie: authorCookie },
        body: readdV2Form,
      }),
    );
    expect(readdV2Res.status).toBe(200);
    const withV2Again = (await readdV2Res.json()) as {
      latestSemver: string;
      versions: { id: string; semver: string }[];
    };
    expect(withV2Again.latestSemver).toBe("2.0.0");
    expect(withV2Again.versions).toHaveLength(2);
    const restoredV2Id = withV2Again.versions.find((v) => v.semver === "2.0.0")!.id;

    // Duplicate version upload -> 409
    const dupVerForm = new FormData();
    dupVerForm.append("semver", "3.0.0");
    dupVerForm.append("file", new File([v1Bytes], "kk_chara.png", { type: "image/png" }));
    const dupVerRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}/versions`, {
        method: "POST",
        headers: { cookie: authorCookie },
        body: dupVerForm,
      }),
    );
    expect(dupVerRes.status).toBe(409);

    // Non-author PATCH -> 403
    const forbidPatchRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}`, {
        method: "PATCH",
        headers: {
          cookie: otherCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ description: "Nope" }),
      }),
    );
    expect(forbidPatchRes.status).toBe(403);

    // Author PATCH -> 200
    const patchRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}`, {
        method: "PATCH",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ description: "Renamed Title", notes: "Edited v2 note" }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as {
      description: string;
      versions: { id: string; semver: string; notes?: string }[];
    };
    expect(patched.description).toBe("Renamed Title");
    expect(patched.versions.find((v) => v.id === restoredV2Id)?.notes).toBe(
      "Edited v2 note",
    );

    // Delete last remaining versions → empty parent stays
    for (const versionId of [restoredV2Id, v1Id]) {
      const delVerRes = await app.handle(
        new Request(
          `http://localhost/api/kk/cards/${created.id}/versions/${versionId}`,
          { method: "DELETE", headers: { cookie: authorCookie } },
        ),
      );
      expect(delVerRes.status).toBe(200);
    }
    const emptyGet = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}`, {
        headers: { cookie: authorCookie },
      }),
    );
    expect(emptyGet.status).toBe(200);
    const emptyCard = (await emptyGet.json()) as {
      latestSemver: string | null;
      latestVersionId: string | null;
      versions: unknown[];
    };
    expect(emptyCard.latestSemver).toBeNull();
    expect(emptyCard.latestVersionId).toBeNull();
    expect(emptyCard.versions).toEqual([]);

    // Non-author DELETE -> 403
    const forbidDelRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}`, {
        method: "DELETE",
        headers: { cookie: otherCookie },
      }),
    );
    expect(forbidDelRes.status).toBe(403);

    // Author DELETE -> 200
    const delRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}`, {
        method: "DELETE",
        headers: { cookie: authorCookie },
      }),
    );
    expect(delRes.status).toBe(200);

    // GET after delete -> 404
    const afterGet = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}`),
    );
    expect(afterGet.status).toBe(404);
  });

  test("card HTTP responses strip originalPath and previewPath from card and versions", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const v2Bytes = await fixtureBytes("chara", "kk_mod_chara.png");

    const createForm = new FormData();

    createForm.append("gameId", gameId);

    createForm.append("semver", "1.0.0");
    createForm.append("file", new File([v1Bytes], "kk_chara.png", { type: "image/png" }));
    createForm.append("description", "No Paths Card");

    const createRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: createForm,
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
      new Request(`http://localhost/api/kk/cards/${created.id}`),
    );
    expect(getRes.status).toBe(200);
    const detail = (await getRes.json()) as Record<string, unknown> & {
      versions: Record<string, unknown>[];
    };
    expect(detail.originalPath).toBeUndefined();
    expect(detail.previewPath).toBeUndefined();
    expect(detail.versions[0]!.originalPath).toBeUndefined();
    expect(detail.versions[0]!.previewPath).toBeUndefined();

    const verForm = new FormData();

    verForm.append("semver", "2.0.0");
    verForm.append("file", new File([v2Bytes], "kk_mod_chara.png", { type: "image/png" }));
    const verRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}/versions`, {
        method: "POST",
        headers: { cookie: authorCookie },
        body: verForm,
      }),
    );
    expect(verRes.status).toBe(200);
    const added = (await verRes.json()) as Record<string, unknown> & {
      versions: Record<string, unknown>[];
    };
    expect(added.originalPath).toBeUndefined();
    expect(added.previewPath).toBeUndefined();
    for (const v of added.versions) {
      expect(v.originalPath).toBeUndefined();
      expect(v.previewPath).toBeUndefined();
    }

    const patchRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}`, {
        method: "PATCH",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ description: "Patched No Paths" }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as Record<string, unknown> & {
      versions: Record<string, unknown>[];
    };
    expect(patched.originalPath).toBeUndefined();
    expect(patched.previewPath).toBeUndefined();
    for (const v of patched.versions) {
      expect(v.originalPath).toBeUndefined();
      expect(v.previewPath).toBeUndefined();
    }
  });

  test("POST /api/kk/cards/:id/versions rejects duplicate semver (409) and invalid semver (400)", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const v2Bytes = await fixtureBytes("chara", "kk_mod_chara.png");

    const createForm = new FormData();
    createForm.append("gameId", gameId);
    createForm.append("semver", "1.0.0");
    createForm.append("file", new File([v1Bytes], "kk_chara.png", { type: "image/png" }));
    const createRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: createForm,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const dupForm = new FormData();
    dupForm.append("semver", "1.0.0");
    dupForm.append("file", new File([v2Bytes], "kk_mod_chara.png", { type: "image/png" }));
    const dupRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}/versions`, {
        method: "POST",
        headers: { cookie: authorCookie },
        body: dupForm,
      }),
    );
    expect(dupRes.status).toBe(409);
    const dupBody = (await dupRes.json()) as { code: string; semver: string };
    expect(dupBody.code).toBe("DUPLICATE_SEMVER");
    expect(dupBody.semver).toBe("1.0.0");

    const badForm = new FormData();
    badForm.append("semver", "banana");
    badForm.append("file", new File([v2Bytes], "kk_mod_chara.png", { type: "image/png" }));
    const badRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}/versions`, {
        method: "POST",
        headers: { cookie: authorCookie },
        body: badForm,
      }),
    );
    expect(badRes.status).toBe(400);
  });
});
