import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { users } from "../../db/schema";
import { fixtureBytes } from "../../kkloader/__tests__/helpers";
import { sha256Hex } from "../../cards/hash";
import {
  addSceneVersion,
  createScene,
  deleteScene,
  findSceneByHash,
  getScene,
  getSceneVersionImage,
  listScenes,
  patchScene,
} from "../service";
import { getVersionPaths } from "../storage";
import { seedTestGame } from "../../__tests__/test-game";
import { findContentBlob } from "../../proxy/blob-store";
import { setContentTags } from "../../tags/service";
import {
  plantLegacySceneVersionOnDisk,
  plantSceneVersionWithBlob,
} from "../../__tests__/image-content-blob-helpers";

describe("scene service", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let gameId: string;
  let otherUserId: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-scene-svc-"));
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
          discordId: "discord-scene-author",
          username: "scene_author",
          avatar: null,
          createdAt: now,
        },
        {
          id: otherUserId,
          discordId: "discord-scene-other",
          username: "other",
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

  test("createScene stores an empty description and no title", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const created = await createScene({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes,
      originalFilename: "Sample Scenes/sample_00.png",
      dbPath,
      dataDir,
    });
    expect(created.description).toBe("");
    expect(created).not.toHaveProperty("title");
    expect(created).not.toHaveProperty("slug");
  });

  test("createScene stores original PNG, WebP preview, and DB rows", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const created = await createScene({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      description: "Simple Studio",
      fileBytes,
      notes: "Initial upload",
      dbPath,
      dataDir,
    });

    expect(created.id).toBeString();
    expect(created.type).toBe("scene");
    expect(created.uploaderId).toBe(authorId);
    expect(created.description).toBe("Simple Studio");
    expect(created.latestSemver).toBe("1.0.0");
    expect(created.latestVersionId).toBe(created.versions[0]!.id);
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]!.semver).toBe("1.0.0");
    expect(created.versions[0]!.imageUrl).toBe(
      `/api/scenes/${created.id}/versions/${created.latestVersionId}/image`,
    );
    expect(created.versions[0]!.notes).toBe("Initial upload");

    const paths = getVersionPaths(created.id, created.latestVersionId, dataDir);
    expect(existsSync(paths.originalPath)).toBe(false);
    expect(existsSync(paths.previewPath)).toBe(true);
    expect(findContentBlob(sha256Hex(fileBytes), dbPath)).toEqual({
      chunkCount: 1,
    });

    const savedOriginal = await getSceneVersionImage(
      created.id,
      created.latestVersionId,
      { dbPath, dataDir, original: true },
    );
    expect(savedOriginal).not.toBeNull();
    expect(Buffer.from(savedOriginal!.bytes).equals(Buffer.from(fileBytes))).toBe(
      true,
    );

    const savedPreview = new Uint8Array(
      await Bun.file(paths.previewPath).arrayBuffer(),
    );
    expect(String.fromCharCode(...savedPreview.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...savedPreview.slice(8, 12))).toBe("WEBP");

    expect(paths.originalPath).toContain(
      `/scenes/${created.id}/${created.latestVersionId}/`,
    );

    const list = (await listScenes({ dbPath, dataDir })).items;
    expect(list).toHaveLength(1);
    expect(list[0]!.uploaderId).toBe(authorId);
    expect(list[0]!.description).toBe("Simple Studio");
    expect(list[0]!.imageUrl).toBe(
      `/api/scenes/${created.id}/versions/${created.latestVersionId}/image`,
    );
  });

  test("second createScene with same file throws 409 with sceneId, versionId and semver", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const first = await createScene({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes,
      dbPath,
      dataDir,
    });

    let caught: unknown;
    try {
      await createScene({
      gameId,
      semver: "1.0.0",
        uploaderId: otherUserId,
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
      sceneId: string;
      versionId: string;
      semver: string;
    };
    expect(conflict.status).toBe(409);
    expect(conflict.sceneId).toBe(first.id);
    expect(conflict.versionId).toBe(first.latestVersionId);
    expect(conflict.semver).toBe("1.0.0");

    expect((await listScenes({ dbPath, dataDir })).items).toHaveLength(1);
  });

  test("character PNG upload throws 400 and writes no files", async () => {
    const charaBytes = await fixtureBytes("chara", "kk_chara.png");

    let caught: unknown;
    try {
      await createScene({
      gameId,
      semver: "1.0.0",
        uploaderId: authorId,
        fileBytes: charaBytes,
        dbPath,
        dataDir,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(400);
    expect((await listScenes({ dbPath, dataDir })).items).toHaveLength(0);
    expect(existsSync(join(dataDir, "scenes"))).toBe(false);
  });

  test("addSceneVersion adds v2 for author and rejects duplicate bytes with 409", async () => {
    const v1Bytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const v2Bytes = await fixtureBytes("scene", "kk_scene_mod.png");

    const scene = await createScene({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      description: "Evolving Scene",
      fileBytes: v1Bytes,
      dbPath,
      dataDir,
    });

    const updated = await addSceneVersion({
      sceneId: scene.id,
      semver: "2.0.0",
      uploaderId: authorId,
      fileBytes: v2Bytes,
      notes: "Modded scene",
      dbPath,
      dataDir,
    });

    expect(updated.latestSemver).toBe("2.0.0");
    expect(updated.latestVersionId).toBe(updated.versions[1]!.id);
    expect(updated.versions).toHaveLength(2);

    let caught: unknown;
    try {
      await addSceneVersion({
        sceneId: scene.id,
        semver: "2.0.0",
        uploaderId: authorId,
        fileBytes: v1Bytes,
        dbPath,
        dataDir,
      });
    } catch (err) {
      caught = err;
    }

    expect((caught as { status: number }).status).toBe(409);
  });

  test("addSceneVersion as non-author throws 403", async () => {
    const v1Bytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const v2Bytes = await fixtureBytes("scene", "kk_scene_mod.png");

    const scene = await createScene({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes: v1Bytes,
      dbPath,
      dataDir,
    });

    let caught: unknown;
    try {
      await addSceneVersion({
        sceneId: scene.id,
        semver: "2.0.0",
        uploaderId: otherUserId,
        fileBytes: v2Bytes,
        dbPath,
        dataDir,
      });
    } catch (err) {
      caught = err;
    }

    expect((caught as { status: number }).status).toBe(403);
    expect(
      existsSync(
        getVersionPaths(scene.id, "unused-version-id", dataDir).originalPath,
      ),
    ).toBe(false);
    expect((await getScene(scene.id, { dbPath, dataDir }))!.versions).toHaveLength(
      1,
    );
  });

  test("addSceneVersion rejects duplicate semver with 409 DUPLICATE_SEMVER", async () => {
    const scene = await createScene({
      gameId,
      uploaderId: authorId,
      semver: "1.0.0",
      fileBytes: await fixtureBytes("scene", "kk_scene_simple.png"),
      dbPath,
      dataDir,
    });

    let caught: unknown;
    try {
      await addSceneVersion({
        sceneId: scene.id,
        uploaderId: authorId,
        semver: "1.0.0",
        fileBytes: await fixtureBytes("scene", "kk_scene_mod.png"),
        dbPath,
        dataDir,
      });
    } catch (err) {
      caught = err;
    }
    const err = caught as { status: number; code: string; semver: string };
    expect(err.status).toBe(409);
    expect(err.code).toBe("DUPLICATE_SEMVER");
    expect(err.semver).toBe("1.0.0");
  });

  test("createScene and addSceneVersion reject missing or invalid semver with 400", async () => {
    const bytes = await fixtureBytes("scene", "kk_scene_simple.png");
    for (const bad of ["", "not-a-version"]) {
      let caught: unknown;
      try {
        await createScene({
          gameId,
          uploaderId: authorId,
          semver: bad,
          fileBytes: bytes,
          dbPath,
          dataDir,
        });
      } catch (err) {
        caught = err;
      }
      expect((caught as { status: number }).status).toBe(400);
    }
    expect((await listScenes({ dbPath, dataDir })).items).toHaveLength(0);
  });

  test("latest is chosen by semver, not insertion order", async () => {
    const scene = await createScene({
      gameId,
      uploaderId: authorId,
      semver: "2.0.0",
      fileBytes: await fixtureBytes("scene", "kk_scene_simple.png"),
      dbPath,
      dataDir,
    });
    const updated = await addSceneVersion({
      sceneId: scene.id,
      uploaderId: authorId,
      semver: "1.5.0",
      fileBytes: await fixtureBytes("scene", "kk_scene_mod.png"),
      dbPath,
      dataDir,
    });
    expect(updated.latestSemver).toBe("2.0.0");
    expect(updated.latestVersionId).toBe(scene.latestVersionId);
    expect(updated.versions.map((v) => v.semver)).toEqual(["1.5.0", "2.0.0"]);
  });

  test("findSceneByHash returns sceneId, versionId and semver when present", async () => {
    const v1Bytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const hash = sha256Hex(v1Bytes);

    expect(findSceneByHash(hash, { dbPath })).toBeNull();

    const scene = await createScene({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes: v1Bytes,
      dbPath,
      dataDir,
    });

    expect(findSceneByHash(hash, { dbPath })).toEqual({
      sceneId: scene.id,
      versionId: scene.latestVersionId,
      semver: "1.0.0",
    });
  });

  test("patchScene and deleteScene enforce author-only access", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const scene = await createScene({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      description: "Before",
      fileBytes,
      dbPath,
      dataDir,
    });
    const contentHash = sha256Hex(fileBytes);

    let forbidden: unknown;
    try {
      await patchScene({
        sceneId: scene.id,
        uploaderId: otherUserId,
        description: "Hacked",
        dbPath,
        dataDir,
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);

    const patched = await patchScene({
      sceneId: scene.id,
      uploaderId: authorId,
      description: "After",
      dbPath,
      dataDir,
    });
    expect(patched.description).toBe("After");
    expect(patched).not.toHaveProperty("title");

    await deleteScene({
      sceneId: scene.id,
      uploaderId: authorId,
      dbPath,
      dataDir,
    });
    expect(await getScene(scene.id, { dbPath, dataDir })).toBeNull();
    expect(findContentBlob(contentHash, dbPath)).toEqual({ chunkCount: 1 });
  });

  test("listScenes with tags returns only scenes that have every tag", async () => {
    const bothBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const onlyBytes = await fixtureBytes("scene", "kk_scene.png");
    const both = await createScene({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes: bothBytes,
      dbPath,
      dataDir,
    });
    const onlyA = await createScene({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes: onlyBytes,
      dbPath,
      dataDir,
    });
    const actor = { userId: authorId, isAdmin: false };
    setContentTags({
      kind: "scenes",
      contentId: both.id,
      names: ["a", "b"],
      actor,
      uploaderId: authorId,
      dbPath,
    });
    setContentTags({
      kind: "scenes",
      contentId: onlyA.id,
      names: ["a"],
      actor,
      uploaderId: authorId,
      dbPath,
    });

    const filtered = await listScenes({ tags: ["a", "b"], dbPath, dataDir });
    expect(filtered.total).toBe(1);
    expect(filtered.items.map((scene) => scene.id)).toEqual([both.id]);
  });

  test("legacy disk original_path is served when blob is absent", async () => {
    const db = getDb(dbPath);
    const planted = await plantLegacySceneVersionOnDisk(db, {
      gameId,
      uploaderId: authorId,
      dataDir,
    });

    expect(findContentBlob(planted.contentHash, dbPath)).toBeNull();

    const file = await getSceneVersionImage(
      planted.sceneId,
      planted.versionId,
      { dbPath, dataDir, original: true },
    );
    expect(file).not.toBeNull();
    expect(Buffer.from(file!.bytes).equals(Buffer.from(planted.fileBytes))).toBe(
      true,
    );
  });

  test("deleteScene keeps content blob after catalog row is removed", async () => {
    const db = getDb(dbPath);
    const planted = await plantSceneVersionWithBlob(db, {
      gameId,
      uploaderId: authorId,
      dbPath,
      dataDir,
    });

    await deleteScene({
      sceneId: planted.sceneId,
      uploaderId: authorId,
      dbPath,
      dataDir,
    });

    expect(await getScene(planted.sceneId, { dbPath, dataDir })).toBeNull();
    expect(findContentBlob(planted.contentHash, dbPath)).toEqual({
      chunkCount: 1,
    });
  });
});
