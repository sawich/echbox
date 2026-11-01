import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { eq } from "drizzle-orm";
import { sha256Hex } from "../../cards/hash";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { pluginVotes, users } from "../../db/schema";
import { fixtureBytes } from "../../kkloader/__tests__/helpers";
import {
  addPluginVersion,
  createPlugin,
  deletePlugin,
  findPluginByHash,
  getPlugin,
  getPluginVersionBytes,
  listPlugins,
  patchPlugin,
} from "../service";
import { pluginVersionPaths } from "../storage";
import { setPluginVote } from "../votes";
import { seedTestGame } from "../../__tests__/test-game";

function pluginZip(payload = "plugin-payload-a"): Uint8Array {
  return zipSync({ "data.txt": strToU8(payload) });
}

describe("plugin service", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let gameId: string;
  let otherUserId: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-plugin-svc-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;

    migrateDb(dbPath);
    const db = getDb(dbPath);

    authorId = crypto.randomUUID();
    otherUserId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(users)
      .values([
        {
          id: authorId,
          discordId: "discord-plugin-author",
          username: "plugin_author",
          avatar: null,
          createdAt: now,
        },
        {
          id: otherUserId,
          discordId: "discord-plugin-other",
          username: "other_user",
          avatar: null,
          createdAt: now,
        },
      ])
      .run();

    gameId = seedTestGame(authorId, { dbPath }).id;
  });

  afterEach(() => {
    delete process.env.DATABASE_PATH;
    delete process.env.DATA_DIR;
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("createPlugin stores zip from fixture with UUID id and manual title", async () => {
    const fileBytes = await fixtureBytes("plugins", "testplugin.zip");
    const created = await createPlugin({ gameId,
      authorId,
      title: "My Plugin",
      description: "Does things",
      notes: "First release",
      fileBytes,
      dbPath,
      dataDir,
    });

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(created.title).toBe("My Plugin");
    expect(created.description).toBe("Does things");
    expect(created.latestVersion).toBe(1);
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]!.notes).toBe("First release");
    expect(created.versions[0]!.downloadUrl).toBe(
      `/api/plugins/${created.id}/versions/1/download`,
    );
    expect(created.uploader).toEqual({
      id: authorId,
      username: "plugin_author",
    });

    const paths = pluginVersionPaths(dataDir, created.id, 1);
    expect(existsSync(paths.originalPath)).toBe(true);
    expect(paths.originalPath.endsWith("original.zip")).toBe(true);
    const saved = new Uint8Array(
      await Bun.file(paths.originalPath).arrayBuffer(),
    );
    expect(Buffer.from(saved).equals(Buffer.from(fileBytes))).toBe(true);

    const list = await listPlugins({ dbPath, dataDir });
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(created.id);
  });

  test("second createPlugin with same file bytes throws DuplicatePluginHashError", async () => {
    const fileBytes = await fixtureBytes("plugins", "testplugin.zip");
    const first = await createPlugin({ gameId,
      authorId,
      title: "First",
      fileBytes,
      dbPath,
      dataDir,
    });

    let caught: unknown;
    try {
      await createPlugin({ gameId,
        authorId: otherUserId,
        title: "Second",
        fileBytes,
        dbPath,
        dataDir,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    const conflict = caught as {
      status: number;
      pluginId: string;
      version: number;
      name: string;
    };
    expect(conflict.status).toBe(409);
    expect(conflict.name).toBe("DuplicatePluginHashError");
    expect(conflict.pluginId).toBe(first.id);
    expect(conflict.version).toBe(1);
  });

  test("patchPlugin updates title and description for author only", async () => {
    const fileBytes = pluginZip("patch-test");
    const created = await createPlugin({ gameId,
      authorId,
      title: "Original",
      description: "Old desc",
      fileBytes,
      dbPath,
      dataDir,
    });

    let forbidden: unknown;
    try {
      await patchPlugin({
        id: created.id,
        authorId: otherUserId,
        title: "Hacked",
        dbPath,
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);

    const patched = await patchPlugin({
      id: created.id,
      authorId,
      title: "Renamed",
      description: "New desc",
      dbPath,
      dataDir,
    });
    expect(patched.title).toBe("Renamed");
    expect(patched.description).toBe("New desc");

    const fetched = await getPlugin(created.id, { dbPath, dataDir });
    expect(fetched!.title).toBe("Renamed");
  });

  test("addPluginVersion as non-author throws 403", async () => {
    const v1 = pluginZip("v1");
    const created = await createPlugin({ gameId,
      authorId,
      title: "Plugin",
      fileBytes: v1,
      dbPath,
      dataDir,
    });

    const v2 = pluginZip("v2-extra-bytes");

    let caught: unknown;
    try {
      await addPluginVersion({
        pluginId: created.id,
        authorId: otherUserId,
        fileBytes: v2,
        dbPath,
        dataDir,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(403);
    expect(
      existsSync(pluginVersionPaths(dataDir, created.id, 2).originalPath),
    ).toBe(false);
  });

  test("getPluginVersionBytes returns stored zip bytes", async () => {
    const fileBytes = pluginZip("download-me");
    const created = await createPlugin({ gameId,
      authorId,
      title: "Dl",
      fileBytes,
      dbPath,
      dataDir,
    });

    const file = await getPluginVersionBytes(created.id, 1, {
      dbPath,
      dataDir,
    });
    expect(file).not.toBeNull();
    expect(file!.contentType).toBe("application/zip");
    expect(Buffer.from(file!.bytes).equals(Buffer.from(fileBytes))).toBe(true);
  });

  test("findPluginByHash returns pluginId and version when present", async () => {
    const fileBytes = pluginZip("hash-lookup");
    const hash = sha256Hex(fileBytes);

    expect(await findPluginByHash(hash, { dbPath })).toBeNull();

    const created = await createPlugin({ gameId,
      authorId,
      title: "Hash",
      fileBytes,
      dbPath,
      dataDir,
    });

    expect(await findPluginByHash(hash, { dbPath })).toEqual({
      pluginId: created.id,
      version: 1,
    });
  });

  test("deletePlugin removes DB rows and files for author only", async () => {
    const fileBytes = pluginZip("delete-me");
    const created = await createPlugin({ gameId,
      authorId,
      title: "Del",
      fileBytes,
      dbPath,
      dataDir,
    });
    const paths = pluginVersionPaths(dataDir, created.id, 1);
    expect(existsSync(paths.originalPath)).toBe(true);

    setPluginVote({
      pluginId: created.id,
      userId: otherUserId,
      vote: "like",
      dbPath,
    });

    let forbidden: unknown;
    try {
      await deletePlugin({
        pluginId: created.id,
        authorId: otherUserId,
        dbPath,
        dataDir,
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);
    expect(existsSync(paths.originalPath)).toBe(true);

    await deletePlugin({
      pluginId: created.id,
      authorId,
      dbPath,
      dataDir,
    });

    expect(await getPlugin(created.id, { dbPath })).toBeNull();
    const db = getDb(dbPath);
    expect(
      db
        .select()
        .from(pluginVotes)
        .where(eq(pluginVotes.pluginId, created.id))
        .all(),
    ).toHaveLength(0);
    expect(existsSync(paths.originalPath)).toBe(false);
  });
});
