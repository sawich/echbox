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

function pluginZip(payload = "http-payload"): Uint8Array {
  return zipSync({ "data.txt": strToU8(payload) });
}

describe("Plugin HTTP routes", () => {
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
    tempDir = mkdtempSync(join(tmpdir(), "echbox-plugins-http-"));
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
          discordId: "discord-plugin-http-author",
          username: "plugin_author",
          avatar: null,
          createdAt: now,
        },
        {
          id: otherUserId,
          discordId: "discord-plugin-http-other",
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

  async function createPluginViaHttp(
    title: string,
    fileBytes: Uint8Array,
    cookie: string,
    extra?: { description?: string; notes?: string },
  ) {
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "plugin.zip", { type: "application/zip" }),
    );
    form.append("title", title);
    if (extra?.description != null) {
      form.append("description", extra.description);
    }
    if (extra?.notes != null) {
      form.append("notes", extra.notes);
    }

    return app.handle(
      new Request("http://localhost/api/plugins", {
        method: "POST",
        headers: { cookie },
        body: form,
      }),
    );
  }

  test("GET /api/plugins lists created plugin after POST", async () => {
    const emptyRes = await app.handle(
      new Request("http://localhost/api/plugins"),
    );
    expect(emptyRes.status).toBe(200);
    const emptyBody = (await emptyRes.json()) as { plugins: unknown[] };
    expect(emptyBody.plugins).toEqual([]);

    const fileBytes = await fixtureBytes("plugins", "testplugin.zip");
    const createRes = await createPluginViaHttp(
      "Listed Plugin",
      fileBytes,
      authorCookie,
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      title: string;
      authorId: string;
    };
    expect(created.title).toBe("Listed Plugin");
    expect(created.authorId).toBe(authorId);

    const listRes = await app.handle(
      new Request("http://localhost/api/plugins"),
    );
    const listBody = (await listRes.json()) as {
      plugins: { id: string; downloadUrl: string }[];
    };
    expect(listBody.plugins).toHaveLength(1);
    expect(listBody.plugins[0]!.downloadUrl).toBe(
      `/api/plugins/${created.id}/versions/1/download`,
    );
  });

  test("POST /api/plugins rejects duplicate content hash with 409", async () => {
    const fileBytes = await fixtureBytes("plugins", "testplugin.zip");

    const res1 = await createPluginViaHttp("One", fileBytes, authorCookie);
    expect(res1.status).toBe(201);
    const created = (await res1.json()) as { id: string };

    const res2 = await createPluginViaHttp("Two", fileBytes, otherCookie);
    expect(res2.status).toBe(409);
    const conflictBody = (await res2.json()) as {
      pluginId: string;
      version: number;
      code: string;
    };
    expect(conflictBody.code).toBe("CONFLICT");
    expect(conflictBody.pluginId).toBe(created.id);
    expect(conflictBody.version).toBe(1);
  });

  test("PATCH /api/plugins/:id updates title for author and rejects non-author", async () => {
    const fileBytes = pluginZip("patch-http");
    const createRes = await createPluginViaHttp(
      "Before",
      fileBytes,
      authorCookie,
      { description: "desc" },
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const forbidRes = await app.handle(
      new Request(`http://localhost/api/plugins/${created.id}`, {
        method: "PATCH",
        headers: {
          cookie: otherCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Stolen" }),
      }),
    );
    expect(forbidRes.status).toBe(403);

    const patchRes = await app.handle(
      new Request(`http://localhost/api/plugins/${created.id}`, {
        method: "PATCH",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "After", description: "updated" }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as {
      title: string;
      description: string;
    };
    expect(patched.title).toBe("After");
    expect(patched.description).toBe("updated");
  });

  test("GET /api/plugins/by-hash/:hash and download", async () => {
    const fileBytes = pluginZip("by-hash-dl");
    const hash = sha256Hex(fileBytes);

    const missRes = await app.handle(
      new Request(`http://localhost/api/plugins/by-hash/${hash}`),
    );
    expect(missRes.status).toBe(404);

    const createRes = await createPluginViaHttp("Hash Plugin", fileBytes, authorCookie);
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const hitRes = await app.handle(
      new Request(`http://localhost/api/plugins/by-hash/${hash}`),
    );
    expect(hitRes.status).toBe(200);
    const hitBody = (await hitRes.json()) as { pluginId: string; version: number };
    expect(hitBody.pluginId).toBe(created.id);
    expect(hitBody.version).toBe(1);

    const dlRes = await app.handle(
      new Request(
        `http://localhost/api/plugins/${created.id}/versions/1/download`,
      ),
    );
    expect(dlRes.status).toBe(200);
    const disposition = dlRes.headers.get("content-disposition") ?? "";
    expect(disposition).toContain(".zip");
    const downloaded = new Uint8Array(await dlRes.arrayBuffer());
    expect(Buffer.from(downloaded).equals(Buffer.from(fileBytes))).toBe(true);
  });

  test("PUT /api/plugins/:id/vote requires auth and updates counts", async () => {
    const fileBytes = pluginZip("vote-test");
    const createRes = await createPluginViaHttp("Vote", fileBytes, authorCookie);
    const created = (await createRes.json()) as { id: string };

    const unauthVote = await app.handle(
      new Request(`http://localhost/api/plugins/${created.id}/vote`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vote: "like" }),
      }),
    );
    expect(unauthVote.status).toBe(401);

    const voteRes = await app.handle(
      new Request(`http://localhost/api/plugins/${created.id}/vote`, {
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

  test("POST /api/plugins requires auth (401)", async () => {
    const fileBytes = await fixtureBytes("plugins", "testplugin.zip");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "plugin.zip", { type: "application/zip" }),
    );
    form.append("title", "No auth");

    const res = await app.handle(
      new Request("http://localhost/api/plugins", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(401);
  });
});
