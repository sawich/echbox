import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { eq } from "drizzle-orm";
import { sha256Hex } from "../../cards/hash";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { pluginVotes, pluginVersions, plugins, users } from "../../db/schema";
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
import { findContentBlob } from "../../proxy/blob-store";
import { createFakeTransport } from "../../proxy/__tests__/helpers";
import type { TelegramTransport } from "../../proxy/blob-store";

const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  let transport: TelegramTransport;
  const telegramChatId = "-100999";

  const blobOpts = () => ({ dbPath, dataDir, transport, telegramChatId });

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
    transport = createFakeTransport();
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
      semver: "1.0.0",
      description: "Does things",
      notes: "First release",
      fileBytes,
      ...blobOpts(),
    });

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(created.title).toBe("My Plugin");
    expect(created.description).toBe("Does things");
    expect(created.latestSemver).toBe("1.0.0");
    expect(created.versions).toHaveLength(1);
    const v1 = created.versions[0]!;
    expect(v1.semver).toBe("1.0.0");
    expect(created.latestVersionId).toBe(v1.id);
    expect(v1.id).toMatch(UUID_V7_RE);
    expect(created.id).toMatch(UUID_V7_RE);
    expect(created.versions[0]!.notes).toBe("First release");
    expect(created.versions[0]!.downloadUrl).toBe(
      `/api/plugins/${created.id}/versions/${v1.id}/download`,
    );
    expect(created.downloadUrl).toBe(v1.downloadUrl);
    expect(created.uploader).toEqual({
      id: authorId,
      username: "plugin_author",
    });

    expect(created.versions[0]!.originalPath).toBeNull();
    const paths = pluginVersionPaths(dataDir, created.id, v1.id);
    expect(existsSync(paths.originalPath)).toBe(false);
    expect(
      findContentBlob(sha256Hex(fileBytes), dbPath),
    ).toEqual({ chunkCount: 1 });

    const list = (await listPlugins({ dbPath, dataDir })).items;
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(created.id);
  });

  test("second createPlugin with same file bytes throws DuplicatePluginHashError", async () => {
    const fileBytes = await fixtureBytes("plugins", "testplugin.zip");
    const first = await createPlugin({ gameId,
      authorId,
      title: "First",
      semver: "1.0.0",
      fileBytes,
      ...blobOpts(),
    });

    let caught: unknown;
    try {
      await createPlugin({ gameId,
        authorId: otherUserId,
        title: "Second",
        semver: "1.0.0",
        fileBytes,
        ...blobOpts(),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    const conflict = caught as {
      status: number;
      pluginId: string;
      versionId: string;
      semver: string;
      name: string;
    };
    expect(conflict.status).toBe(409);
    expect(conflict.name).toBe("DuplicatePluginHashError");
    expect(conflict.pluginId).toBe(first.id);
    expect(conflict.versionId).toBe(first.versions[0]!.id);
    expect(conflict.semver).toBe("1.0.0");
  });

  test("patchPlugin updates title and description for author only", async () => {
    const fileBytes = pluginZip("patch-test");
    const created = await createPlugin({ gameId,
      authorId,
      title: "Original",
      semver: "1.0.0",
      description: "Old desc",
      fileBytes,
      ...blobOpts(),
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
      semver: "1.0.0",
      fileBytes: v1,
      ...blobOpts(),
    });

    const v2 = pluginZip("v2-extra-bytes");

    let caught: unknown;
    try {
      await addPluginVersion({
        pluginId: created.id,
        authorId: otherUserId,
        semver: "1.1.0",
        fileBytes: v2,
        ...blobOpts(),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(403);
    expect(existsSync(join(dataDir, "plugins", created.id))).toBe(false);
  });

  test("getPluginVersionBytes returns stored zip bytes", async () => {
    const fileBytes = pluginZip("download-me");
    const created = await createPlugin({ gameId,
      authorId,
      title: "Dl",
      semver: "1.0.0",
      fileBytes,
      ...blobOpts(),
    });

    const file = await getPluginVersionBytes(created.id, created.latestVersionId, {
      ...blobOpts(),
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
      semver: "1.0.0",
      fileBytes,
      ...blobOpts(),
    });

    expect(await findPluginByHash(hash, { dbPath })).toEqual({
      pluginId: created.id,
      versionId: created.latestVersionId,
      semver: "1.0.0",
    });
  });

  test("addPluginVersion picks latest by semver, not upload order", async () => {
    const created = await createPlugin({
      gameId,
      authorId,
      title: "Semver",
      semver: "2.0.0",
      fileBytes: pluginZip("two"),
      ...blobOpts(),
    });
    const v2Id = created.latestVersionId;

    const afterLower = await addPluginVersion({
      pluginId: created.id,
      authorId,
      semver: "1.5.0",
      fileBytes: pluginZip("one-five"),
      ...blobOpts(),
    });
    expect(afterLower.latestSemver).toBe("2.0.0");
    expect(afterLower.latestVersionId).toBe(v2Id);
    expect(afterLower.versions.map((v) => v.semver)).toEqual([
      "1.5.0",
      "2.0.0",
    ]);

    const afterHigher = await addPluginVersion({
      pluginId: created.id,
      authorId,
      semver: "2.1.0",
      fileBytes: pluginZip("two-one"),
      ...blobOpts(),
    });
    expect(afterHigher.latestSemver).toBe("2.1.0");
    const newest = afterHigher.versions.find((v) => v.semver === "2.1.0")!;
    expect(afterHigher.latestVersionId).toBe(newest.id);
    expect(afterHigher.downloadUrl).toBe(newest.downloadUrl);
    expect(newest.id).toMatch(UUID_V7_RE);
    expect(afterHigher.versionCount).toBe(3);

    const [item] = (await listPlugins({ dbPath, dataDir })).items;
    expect(item!.latestSemver).toBe("2.1.0");
    expect(item!.latestVersionId).toBe(newest.id);
  });

  test("duplicate semver on addPluginVersion throws 409 with versionId + semver", async () => {
    const created = await createPlugin({
      gameId,
      authorId,
      title: "Dup semver",
      semver: "1.0.0",
      fileBytes: pluginZip("a"),
      ...blobOpts(),
    });

    let caught: unknown;
    try {
      await addPluginVersion({
        pluginId: created.id,
        authorId,
        semver: "v1.0.0",
        fileBytes: pluginZip("b"),
        ...blobOpts(),
      });
    } catch (err) {
      caught = err;
    }
    const conflict = caught as {
      status: number;
      name: string;
      versionId: string;
      semver: string;
    };
    expect(conflict.status).toBe(409);
    expect(conflict.name).toBe("DuplicatePluginSemverError");
    expect(conflict.semver).toBe("1.0.0");
    expect(conflict.versionId).toBe(created.latestVersionId);
    expect(existsSync(join(dataDir, "plugins", created.id))).toBe(false);
  });

  test("create/addVersion reject missing or invalid semver", async () => {
    for (const semver of ["", "   ", "not-a-version"]) {
      await expect(
        createPlugin({
          gameId,
          authorId,
          title: "Bad",
          semver,
          fileBytes: pluginZip("bad"),
          ...blobOpts(),
        }),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      createPlugin({
        gameId,
        authorId,
        title: "Missing",
        fileBytes: pluginZip("missing"),
        ...blobOpts(),
      } as unknown as Parameters<typeof createPlugin>[0]),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("deletePlugin removes DB rows and files for author only", async () => {
    const fileBytes = pluginZip("delete-me");
    const contentHash = sha256Hex(fileBytes);
    const created = await createPlugin({ gameId,
      authorId,
      title: "Del",
      semver: "1.0.0",
      fileBytes,
      ...blobOpts(),
    });

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
        ...blobOpts(),
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);

    await deletePlugin({
      pluginId: created.id,
      authorId,
      ...blobOpts(),
    });

    expect(await getPlugin(created.id, { dbPath })).toBeNull();
    expect(findContentBlob(contentHash, dbPath)).toEqual({ chunkCount: 1 });
    const db = getDb(dbPath);
    expect(
      db
        .select()
        .from(pluginVotes)
        .where(eq(pluginVotes.pluginId, created.id))
        .all(),
    ).toHaveLength(0);
  });

  test("legacy disk original_path is served when blob is absent", async () => {
    const fileBytes = pluginZip("legacy-disk");
    const contentHash = sha256Hex(fileBytes);
    const pluginId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const paths = pluginVersionPaths(dataDir, pluginId, versionId);
    await Bun.write(paths.originalPath, fileBytes);

    const db = getDb(dbPath);
    db.insert(plugins)
      .values({
        id: pluginId,
        gameId,
        authorId,
        title: "Legacy",
        description: null,
        latestSemver: "1.0.0",
        latestVersionId: versionId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(pluginVersions)
      .values({
        id: versionId,
        pluginId,
        semver: "1.0.0",
        notes: null,
        contentHash,
        originalPath: paths.originalPath,
        summaryJson: "{}",
        createdAt: now,
      })
      .run();

    expect(findContentBlob(contentHash, dbPath)).toBeNull();

    const file = await getPluginVersionBytes(pluginId, versionId, blobOpts());
    expect(file).not.toBeNull();
    expect(Buffer.from(file!.bytes).equals(Buffer.from(fileBytes))).toBe(true);
  });
});
