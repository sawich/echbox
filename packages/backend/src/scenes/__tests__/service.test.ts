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
  listScenes,
  patchScene,
} from "../service";
import { getVersionPaths } from "../storage";

describe("scene service", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
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
  });

  afterEach(() => {
    delete process.env.DATABASE_PATH;
    delete process.env.DATA_DIR;
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("createScene stores original PNG, WebP preview, and DB rows", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const created = await createScene({
      authorId,
      title: "Simple Studio",
      fileBytes,
      notes: "Initial upload",
      dbPath,
      dataDir,
    });

    expect(created.id).toBeString();
    expect(created.type).toBe("scene");
    expect(created.authorId).toBe(authorId);
    expect(created.title).toBe("Simple Studio");
    expect(created.latestVersion).toBe(1);
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]!.imageUrl).toBe(
      `/api/scenes/${created.id}/versions/1/image`,
    );
    expect(created.versions[0]!.notes).toBe("Initial upload");

    const paths = getVersionPaths(created.id, 1, dataDir);
    expect(existsSync(paths.originalPath)).toBe(true);
    expect(existsSync(paths.previewPath)).toBe(true);
    expect(paths.originalPath).toContain(`/scenes/${created.id}/v1/`);

    const list = await listScenes({ dbPath, dataDir });
    expect(list).toHaveLength(1);
    expect(list[0]!.authorId).toBe(authorId);
    expect(list[0]!.imageUrl).toBe(
      `/api/scenes/${created.id}/versions/1/image`,
    );
  });

  test("second createScene with same file throws 409 with sceneId and version", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const first = await createScene({
      authorId,
      fileBytes,
      dbPath,
      dataDir,
    });

    let caught: unknown;
    try {
      await createScene({
        authorId: otherUserId,
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
      version: number;
    };
    expect(conflict.status).toBe(409);
    expect(conflict.sceneId).toBe(first.id);
    expect(conflict.version).toBe(1);

    expect(await listScenes({ dbPath, dataDir })).toHaveLength(1);
  });

  test("character PNG upload throws 400 and writes no files", async () => {
    const charaBytes = await fixtureBytes("chara", "kk_chara.png");

    let caught: unknown;
    try {
      await createScene({
        authorId,
        fileBytes: charaBytes,
        dbPath,
        dataDir,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(400);
    expect(await listScenes({ dbPath, dataDir })).toHaveLength(0);
    expect(existsSync(join(dataDir, "scenes"))).toBe(false);
  });

  test("addSceneVersion adds v2 for author and rejects duplicate bytes with 409", async () => {
    const v1Bytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const v2Bytes = await fixtureBytes("scene", "kk_scene_mod.png");

    const scene = await createScene({
      authorId,
      title: "Evolving Scene",
      fileBytes: v1Bytes,
      dbPath,
      dataDir,
    });

    const updated = await addSceneVersion({
      sceneId: scene.id,
      authorId,
      fileBytes: v2Bytes,
      notes: "Modded scene",
      dbPath,
      dataDir,
    });

    expect(updated.latestVersion).toBe(2);
    expect(updated.versions).toHaveLength(2);

    let caught: unknown;
    try {
      await addSceneVersion({
        sceneId: scene.id,
        authorId,
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
      authorId,
      fileBytes: v1Bytes,
      dbPath,
      dataDir,
    });

    let caught: unknown;
    try {
      await addSceneVersion({
        sceneId: scene.id,
        authorId: otherUserId,
        fileBytes: v2Bytes,
        dbPath,
        dataDir,
      });
    } catch (err) {
      caught = err;
    }

    expect((caught as { status: number }).status).toBe(403);
    expect(
      existsSync(getVersionPaths(scene.id, 2, dataDir).originalPath),
    ).toBe(false);
  });

  test("findSceneByHash returns sceneId and version when present", async () => {
    const v1Bytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const hash = sha256Hex(v1Bytes);

    expect(findSceneByHash(hash, { dbPath })).toBeNull();

    const scene = await createScene({
      authorId,
      fileBytes: v1Bytes,
      dbPath,
      dataDir,
    });

    expect(findSceneByHash(hash, { dbPath })).toEqual({
      sceneId: scene.id,
      version: 1,
    });
  });

  test("patchScene and deleteScene enforce author-only access", async () => {
    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const scene = await createScene({
      authorId,
      title: "Before",
      fileBytes,
      dbPath,
      dataDir,
    });

    let forbidden: unknown;
    try {
      await patchScene({
        sceneId: scene.id,
        authorId: otherUserId,
        title: "Hacked",
        dbPath,
        dataDir,
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);

    const patched = await patchScene({
      sceneId: scene.id,
      authorId,
      title: "After",
      dbPath,
      dataDir,
    });
    expect(patched.title).toBe("After");

    await deleteScene({
      sceneId: scene.id,
      authorId,
      dbPath,
      dataDir,
    });
    expect(await getScene(scene.id, { dbPath, dataDir })).toBeNull();
  });
});
