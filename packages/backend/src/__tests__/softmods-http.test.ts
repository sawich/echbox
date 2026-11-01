import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { app } from "../app";
import { createSession } from "../auth/session";
import { sha256Hex } from "../cards/hash";
import { getDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { users } from "../db/schema";
import { fixtureBytes } from "../kkloader/__tests__/helpers";

function zipmodWithGuid(
  guid: string,
  packageVersion = "1.0.0",
  extraPayload = "payload-a",
): Uint8Array {
  const manifest = `<?xml version="1.0"?>
<Manifest>
  <guid>${guid}</guid>
  <name>Test Mod</name>
  <version>${packageVersion}</version>
  <author>Tester</author>
  <description>A test mod</description>
</Manifest>`;
  return zipSync({
    "manifest.xml": strToU8(manifest),
    "data.txt": strToU8(extraPayload),
  });
}

describe("Softmod HTTP routes", () => {
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
    tempDir = mkdtempSync(join(tmpdir(), "echbox-softmods-http-"));
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
          discordId: "discord-softmod-http-author",
          username: "softmod_author",
          avatar: null,
          createdAt: now,
        },
        {
          id: otherUserId,
          discordId: "discord-softmod-http-other",
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

  test("GET /api/softmods is empty initially, then lists created softmod", async () => {
    const emptyRes = await app.handle(
      new Request("http://localhost/api/softmods"),
    );
    expect(emptyRes.status).toBe(200);
    const emptyBody = (await emptyRes.json()) as { softmods: unknown[] };
    expect(emptyBody.softmods).toEqual([]);

    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "testmod.zipmod", { type: "application/zip" }),
    );
    form.append("notes", "v1 upload");

    const createRes = await app.handle(
      new Request("http://localhost/api/softmods", {
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
    expect(created.id).toBe("com.echbox.testmod");
    expect(created.title).toBe("Test Mod");
    expect(created.latestVersion).toBe(1);
    expect(created.authorId).toBe(authorId);

    const listRes = await app.handle(
      new Request("http://localhost/api/softmods"),
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      softmods: { id: string; title: string; downloadUrl: string }[];
    };
    expect(listBody.softmods).toHaveLength(1);
    expect(listBody.softmods[0]!.id).toBe(created.id);
    expect(listBody.softmods[0]!.downloadUrl).toBe(
      `/api/softmods/${created.id}/versions/1/download`,
    );
  });

  test("POST /api/softmods rejects duplicate content hash with 409", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");

    const form1 = new FormData();
    form1.append(
      "file",
      new File([fileBytes], "testmod.zipmod", { type: "application/zip" }),
    );
    const res1 = await app.handle(
      new Request("http://localhost/api/softmods", {
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
      new File([fileBytes], "testmod.zipmod", { type: "application/zip" }),
    );
    const res2 = await app.handle(
      new Request("http://localhost/api/softmods", {
        method: "POST",
        headers: { cookie: otherCookie },
        body: form2,
      }),
    );
    expect(res2.status).toBe(409);
    const conflictBody = (await res2.json()) as {
      softmodId: string;
      version: number;
      code: string;
    };
    expect(conflictBody.code).toBe("CONFLICT");
    expect(conflictBody.softmodId).toBe(created.id);
    expect(conflictBody.version).toBe(1);
  });

  test("POST /api/softmods requires auth (401)", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "testmod.zipmod", { type: "application/zip" }),
    );

    const res = await app.handle(
      new Request("http://localhost/api/softmods", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(401);
  });

  test("POST /api/softmods rejects duplicate GUID with 409", async () => {
    const guid = "com.echbox.http-guid-conflict";
    const firstBytes = zipmodWithGuid(guid, "1.0.0", "first");
    const secondBytes = zipmodWithGuid(guid, "2.0.0", "second");

    const form1 = new FormData();
    form1.append(
      "file",
      new File([firstBytes], "a.zipmod", { type: "application/zip" }),
    );
    const res1 = await app.handle(
      new Request("http://localhost/api/softmods", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form1,
      }),
    );
    expect(res1.status).toBe(201);

    const form2 = new FormData();
    form2.append(
      "file",
      new File([secondBytes], "b.zipmod", { type: "application/zip" }),
    );
    const res2 = await app.handle(
      new Request("http://localhost/api/softmods", {
        method: "POST",
        headers: { cookie: otherCookie },
        body: form2,
      }),
    );
    expect(res2.status).toBe(409);
    const conflictBody = (await res2.json()) as { softmodId: string; code: string };
    expect(conflictBody.softmodId).toBe(guid);
    expect(conflictBody.code).toBe("CONFLICT");
  });

  test("GET /api/softmods/by-hash/:hash returns 404 when unknown and 200 after upload", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const hash = sha256Hex(fileBytes);

    const missRes = await app.handle(
      new Request(`http://localhost/api/softmods/by-hash/${hash}`),
    );
    expect(missRes.status).toBe(404);

    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "testmod.zipmod", { type: "application/zip" }),
    );

    await app.handle(
      new Request("http://localhost/api/softmods", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );

    const hitRes = await app.handle(
      new Request(`http://localhost/api/softmods/by-hash/${hash}`),
    );
    expect(hitRes.status).toBe(200);
    const hitBody = (await hitRes.json()) as {
      softmodId: string;
      version: number;
    };
    expect(hitBody.softmodId).toBe("com.echbox.testmod");
    expect(hitBody.version).toBe(1);
  });

  test("GET /api/softmods/:id/versions/:version/download serves zipmod attachment", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "testmod.zipmod", { type: "application/zip" }),
    );

    const createRes = await app.handle(
      new Request("http://localhost/api/softmods", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const dlRes = await app.handle(
      new Request(
        `http://localhost/api/softmods/${created.id}/versions/1/download`,
      ),
    );
    expect(dlRes.status).toBe(200);
    const ct = dlRes.headers.get("content-type") ?? "";
    expect(
      ct.includes("application/zip") || ct.includes("application/octet-stream"),
    ).toBe(true);
    const disposition = dlRes.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toContain(".zipmod");

    const downloaded = new Uint8Array(await dlRes.arrayBuffer());
    expect(Buffer.from(downloaded).equals(Buffer.from(fileBytes))).toBe(true);
  });

  test("DELETE /api/softmods/:id enforces auth and author-only (401/403/200)", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "testmod.zipmod", { type: "application/zip" }),
    );

    const createRes = await app.handle(
      new Request("http://localhost/api/softmods", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const unauthDel = await app.handle(
      new Request(`http://localhost/api/softmods/${created.id}`, {
        method: "DELETE",
      }),
    );
    expect(unauthDel.status).toBe(401);

    const forbidDel = await app.handle(
      new Request(`http://localhost/api/softmods/${created.id}`, {
        method: "DELETE",
        headers: { cookie: otherCookie },
      }),
    );
    expect(forbidDel.status).toBe(403);

    const delRes = await app.handle(
      new Request(`http://localhost/api/softmods/${created.id}`, {
        method: "DELETE",
        headers: { cookie: authorCookie },
      }),
    );
    expect(delRes.status).toBe(200);

    const afterGet = await app.handle(
      new Request(`http://localhost/api/softmods/${created.id}`),
    );
    expect(afterGet.status).toBe(404);
  });

  test("softmod HTTP responses strip originalPath from detail and versions", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "testmod.zipmod", { type: "application/zip" }),
    );

    const createRes = await app.handle(
      new Request("http://localhost/api/softmods", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      versions: Record<string, unknown>[];
    };
    expect(created.versions[0]!.originalPath).toBeUndefined();

    const getRes = await app.handle(
      new Request(`http://localhost/api/softmods/${created.id}`),
    );
    expect(getRes.status).toBe(200);
    const detail = (await getRes.json()) as {
      versions: Record<string, unknown>[];
    };
    for (const v of detail.versions) {
      expect(v.originalPath).toBeUndefined();
    }
  });

  test("POST /api/softmods/:id/versions enforces auth and author-only (401/403/200)", async () => {
    const v1Bytes = await fixtureBytes("softmods", "testmod.zipmod");
    const createForm = new FormData();
    createForm.append(
      "file",
      new File([v1Bytes], "testmod.zipmod", { type: "application/zip" }),
    );

    const createRes = await app.handle(
      new Request("http://localhost/api/softmods", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: createForm,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const v2Bytes = zipmodWithGuid(created.id, "2.0.0", "v2-payload-extra");

    const unauthVerForm = new FormData();
    unauthVerForm.append(
      "file",
      new File([v2Bytes], "v2.zipmod", { type: "application/zip" }),
    );
    const unauthVerRes = await app.handle(
      new Request(`http://localhost/api/softmods/${created.id}/versions`, {
        method: "POST",
        body: unauthVerForm,
      }),
    );
    expect(unauthVerRes.status).toBe(401);

    const forbidVerForm = new FormData();
    forbidVerForm.append(
      "file",
      new File([v2Bytes], "v2.zipmod", { type: "application/zip" }),
    );
    const forbidVerRes = await app.handle(
      new Request(`http://localhost/api/softmods/${created.id}/versions`, {
        method: "POST",
        headers: { cookie: otherCookie },
        body: forbidVerForm,
      }),
    );
    expect(forbidVerRes.status).toBe(403);

    const verForm = new FormData();
    verForm.append(
      "file",
      new File([v2Bytes], "v2.zipmod", { type: "application/zip" }),
    );
    verForm.append("notes", "Second release");
    const verRes = await app.handle(
      new Request(`http://localhost/api/softmods/${created.id}/versions`, {
        method: "POST",
        headers: { cookie: authorCookie },
        body: verForm,
      }),
    );
    expect(verRes.status).toBe(200);
    const updated = (await verRes.json()) as {
      latestVersion: number;
      versions: { version: number; notes?: string }[];
    };
    expect(updated.latestVersion).toBe(2);
    expect(updated.versions).toHaveLength(2);
    expect(updated.versions[1]!.notes).toBe("Second release");

    const dupVerForm = new FormData();
    dupVerForm.append(
      "file",
      new File([v1Bytes], "testmod.zipmod", { type: "application/zip" }),
    );
    const dupVerRes = await app.handle(
      new Request(`http://localhost/api/softmods/${created.id}/versions`, {
        method: "POST",
        headers: { cookie: authorCookie },
        body: dupVerForm,
      }),
    );
    expect(dupVerRes.status).toBe(409);
    const dupBody = (await dupVerRes.json()) as {
      softmodId: string;
      version: number;
    };
    expect(dupBody.softmodId).toBe(created.id);
    expect(dupBody.version).toBe(1);
  });

  test("PUT /api/softmods/:id/vote requires auth and updates counts", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "testmod.zipmod", { type: "application/zip" }),
    );

    const createRes = await app.handle(
      new Request("http://localhost/api/softmods", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    const created = (await createRes.json()) as { id: string };

    const unauthVote = await app.handle(
      new Request(`http://localhost/api/softmods/${created.id}/vote`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vote: "like" }),
      }),
    );
    expect(unauthVote.status).toBe(401);

    const voteRes = await app.handle(
      new Request(`http://localhost/api/softmods/${created.id}/vote`, {
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
});
