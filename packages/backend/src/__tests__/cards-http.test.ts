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

describe("Character CRUD + hash lookup + gallery split HTTP routes", () => {
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

    const authorSess = await createSession(authorId, dbPath);
    authorCookie = `${SESSION_COOKIE_NAME}=${authorSess.id}`;

    const otherSess = await createSession(otherUserId, dbPath);
    otherCookie = `${SESSION_COOKIE_NAME}=${otherSess.id}`;
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
    form.append("file", new File([fileBytes], "kk_chara.png", { type: "image/png" }));
    form.append("title", "HTTP Heroine");
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
      title: string;
      latestVersion: number;
      authorId: string;
    };
    expect(created.id).toBeString();
    expect(created.title).toBe("HTTP Heroine");
    expect(created.latestVersion).toBe(1);
    expect(created.authorId).toBe(authorId);

    const listRes = await app.handle(
      new Request("http://localhost/api/kk/cards?type=character"),
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      cards: { id: string; title: string; imageUrl: string; type: string }[];
    };
    expect(listBody.cards).toHaveLength(1);
    expect(listBody.cards[0]!.id).toBe(created.id);
    expect(listBody.cards[0]!.title).toBe("HTTP Heroine");
    expect(listBody.cards[0]!.type).toBe("character");
    expect(listBody.cards[0]!.imageUrl).toBe(
      `/api/kk/cards/${created.id}/versions/1/image`,
    );
  });

  test("GET /api/kk/cards?type=scene still returns seed scenes", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards?type=scene"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: { id: string; type: string }[];
    };
    expect(body.cards.length).toBeGreaterThan(0);
    expect(body.cards.every((c) => c.type === "scene")).toBe(true);
    expect(body.cards.some((c) => c.id === "scene-simple")).toBe(true);
  });

  test("GET /api/kk/cards/by-hash/:hash returns 404 when unknown and 200 after upload", async () => {
    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const hash = sha256Hex(fileBytes);

    const missRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/by-hash/${hash}`),
    );
    expect(missRes.status).toBe(404);

    const form = new FormData();
    form.append("file", new File([fileBytes], "kk_chara.png", { type: "image/png" }));

    const createRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const hitRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/by-hash/${hash}`),
    );
    expect(hitRes.status).toBe(200);
    const hitBody = (await hitRes.json()) as {
      cardId: string;
      version: number;
    };
    expect(hitBody.cardId).toBe(created.id);
    expect(hitBody.version).toBe(1);
  });

  test("POST /api/kk/cards requires auth (401) and rejects duplicate hash with 409", async () => {
    const fileBytes = await fixtureBytes("chara", "kk_chara.png");

    const unauthForm = new FormData();
    unauthForm.append("file", new File([fileBytes], "kk_chara.png", { type: "image/png" }));
    const unauthRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        body: unauthForm,
      }),
    );
    expect(unauthRes.status).toBe(401);

    const form1 = new FormData();
    form1.append("file", new File([fileBytes], "kk_chara.png", { type: "image/png" }));
    const res1 = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form1,
      }),
    );
    expect(res1.status).toBe(201);
    const created = (await res1.json()) as { id: string };

    const form2 = new FormData();
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
      version: number;
    };
    expect(conflictBody.cardId).toBe(created.id);
    expect(conflictBody.version).toBe(1);
  });

  test("GET /api/kk/cards/:id/versions/:version/image serves WebP preview by default", async () => {
    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const form = new FormData();
    form.append("file", new File([fileBytes], "kk_chara.png", { type: "image/png" }));

    const createRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const imgRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${created.id}/versions/1/image`),
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
    createForm.append("file", new File([v1Bytes], "kk_chara.png", { type: "image/png" }));
    createForm.append("title", "Original Title");

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
      latestVersion: number;
      versions: { version: number; notes?: string }[];
    };
    expect(updatedCard.latestVersion).toBe(2);
    expect(updatedCard.versions).toHaveLength(2);

    // Duplicate version upload -> 409
    const dupVerForm = new FormData();
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
        body: JSON.stringify({ title: "Nope" }),
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
        body: JSON.stringify({ title: "Renamed Title", notes: "Edited v2 note" }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as {
      title: string;
      versions: { version: number; notes?: string }[];
    };
    expect(patched.title).toBe("Renamed Title");
    expect(patched.versions[1]!.notes).toBe("Edited v2 note");

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
});
