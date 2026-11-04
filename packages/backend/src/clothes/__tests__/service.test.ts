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
  addClothesVersion,
  createClothes,
  deleteClothes,
  deleteClothesVersion,
  findClothesByHash,
  getClothes,
  getClothesVersionImage,
  listClothes,
  patchClothes,
} from "../service";
import { getVersionPaths } from "../storage";
import { seedTestGame } from "../../__tests__/test-game";
import { findContentBlob } from "../../proxy/blob-store";
import {
  plantClothesVersionWithBlob,
  plantLegacyClothesVersionOnDisk,
} from "../../__tests__/image-content-blob-helpers";

async function altClothesBytes(): Promise<Uint8Array> {
  const bytes = await fixtureBytes("clothes", "kk_clothes.png");
  const alt = new Uint8Array(bytes);
  // Flip a trailing payload byte (after PNG IEND) so hash differs but PNG still decodes.
  alt[alt.length - 1] ^= 0x01;
  return alt;
}


describe("clothes service", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let gameId: string;
  let otherUserId: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-clothes-svc-"));
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
          discordId: "discord-clothes-author",
          username: "clothes_author",
          avatar: null,
          createdAt: now,
        },
        {
          id: otherUserId,
          discordId: "discord-clothes-other",
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

  test("createClothes stores original PNG, WebP preview, and DB rows", async () => {
    const fileBytes = await fixtureBytes("clothes", "kk_clothes.png");
    const created = await createClothes({
      gameId,
      semver: "1.0.0",
      authorId,
      title: "Test Outfit",
      fileBytes,
      notes: "Initial upload",
      dbPath,
      dataDir,
    });

    expect(created.id).toBeString();
    expect(created.type).toBe("clothes");
    expect(created.authorId).toBe(authorId);
    expect(created.title).toBe("Test Outfit");
    expect(created.latestSemver).toBe("1.0.0");
    expect(created.latestVersionId).toBe(created.versions[0]!.id);
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]!.semver).toBe("1.0.0");
    expect(created.versions[0]!.imageUrl).toBe(
      `/api/clothes/${created.id}/versions/${created.latestVersionId}/image`,
    );
    expect(created.versions[0]!.notes).toBe("Initial upload");

    const paths = getVersionPaths(created.id, created.latestVersionId, dataDir);
    expect(existsSync(paths.originalPath)).toBe(false);
    expect(existsSync(paths.previewPath)).toBe(true);
    expect(findContentBlob(sha256Hex(fileBytes), dbPath)).toEqual({
      chunkCount: 1,
    });

    const savedOriginal = await getClothesVersionImage(
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
      `/clothes/${created.id}/${created.latestVersionId}/`,
    );

    const list = (await listClothes({ dbPath, dataDir })).items;
    expect(list).toHaveLength(1);
    expect(list[0]!.authorId).toBe(authorId);
    expect(list[0]!.imageUrl).toBe(
      `/api/clothes/${created.id}/versions/${created.latestVersionId}/image`,
    );
  });

  test("second createClothes with same file throws 409 with clothesId, versionId and semver", async () => {
    const fileBytes = await fixtureBytes("clothes", "kk_clothes.png");
    const first = await createClothes({
      gameId,
      semver: "1.0.0",
      authorId,
      fileBytes,
      dbPath,
      dataDir,
    });

    let caught: unknown;
    try {
      await createClothes({
      gameId,
      semver: "1.0.0",
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
      clothesId: string;
      versionId: string;
      semver: string;
    };
    expect(conflict.status).toBe(409);
    expect(conflict.clothesId).toBe(first.id);
    expect(conflict.versionId).toBe(first.latestVersionId);
    expect(conflict.semver).toBe("1.0.0");

    expect((await listClothes({ dbPath, dataDir })).items).toHaveLength(1);
  });

  test("character PNG upload throws 400 and writes no files", async () => {
    const charaBytes = await fixtureBytes("chara", "kk_chara.png");

    let caught: unknown;
    try {
      await createClothes({
      gameId,
      semver: "1.0.0",
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
    expect((await listClothes({ dbPath, dataDir })).items).toHaveLength(0);
    expect(existsSync(join(dataDir, "clothes"))).toBe(false);
  });

  test("addClothesVersion adds v2 for author and rejects duplicate bytes with 409", async () => {
    const v1Bytes = await fixtureBytes("clothes", "kk_clothes.png");
    const v2Bytes = await altClothesBytes();

    const item = await createClothes({
      gameId,
      semver: "1.0.0",
      authorId,
      title: "Evolving Outfit",
      fileBytes: v1Bytes,
      dbPath,
      dataDir,
    });

    const updated = await addClothesVersion({
      clothesId: item.id,
      semver: "2.0.0",
      authorId,
      fileBytes: v2Bytes,
      notes: "Modded outfit",
      dbPath,
      dataDir,
    });

    expect(updated.latestSemver).toBe("2.0.0");
    expect(updated.latestVersionId).toBe(updated.versions[1]!.id);
    expect(updated.versions).toHaveLength(2);

    let caught: unknown;
    try {
      await addClothesVersion({
        clothesId: item.id,
        semver: "2.0.0",
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

  test("addClothesVersion as non-author throws 403", async () => {
    const v1Bytes = await fixtureBytes("clothes", "kk_clothes.png");
    const v2Bytes = await altClothesBytes();

    const item = await createClothes({
      gameId,
      semver: "1.0.0",
      authorId,
      fileBytes: v1Bytes,
      dbPath,
      dataDir,
    });

    let caught: unknown;
    try {
      await addClothesVersion({
        clothesId: item.id,
        semver: "2.0.0",
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
      existsSync(
        getVersionPaths(item.id, "unused-version-id", dataDir).originalPath,
      ),
    ).toBe(false);
    expect((await getClothes(item.id, { dbPath, dataDir }))!.versions).toHaveLength(
      1,
    );
  });

  test("addClothesVersion rejects duplicate semver with 409 DUPLICATE_SEMVER", async () => {
    const item = await createClothes({
      gameId,
      authorId,
      semver: "1.0.0",
      fileBytes: await fixtureBytes("clothes", "kk_clothes.png"),
      dbPath,
      dataDir,
    });

    let caught: unknown;
    try {
      await addClothesVersion({
        clothesId: item.id,
        authorId,
        semver: "1.0.0",
        fileBytes: await altClothesBytes(),
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

  test("createClothes and addClothesVersion reject missing or invalid semver with 400", async () => {
    const bytes = await fixtureBytes("clothes", "kk_clothes.png");
    for (const bad of ["", "not-a-version"]) {
      let caught: unknown;
      try {
        await createClothes({
          gameId,
          authorId,
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
    expect((await listClothes({ dbPath, dataDir })).items).toHaveLength(0);
  });

  test("latest is chosen by semver, not insertion order", async () => {
    const item = await createClothes({
      gameId,
      authorId,
      semver: "2.0.0",
      fileBytes: await fixtureBytes("clothes", "kk_clothes.png"),
      dbPath,
      dataDir,
    });
    const updated = await addClothesVersion({
      clothesId: item.id,
      authorId,
      semver: "1.5.0",
      fileBytes: await altClothesBytes(),
      dbPath,
      dataDir,
    });
    expect(updated.latestSemver).toBe("2.0.0");
    expect(updated.latestVersionId).toBe(item.latestVersionId);
    expect(updated.versions.map((v) => v.semver)).toEqual(["1.5.0", "2.0.0"]);
  });

  test("findClothesByHash returns clothesId, versionId and semver when present", async () => {
    const v1Bytes = await fixtureBytes("clothes", "kk_clothes.png");
    const hash = sha256Hex(v1Bytes);

    expect(findClothesByHash(hash, { dbPath })).toBeNull();

    const item = await createClothes({
      gameId,
      semver: "1.0.0",
      authorId,
      fileBytes: v1Bytes,
      dbPath,
      dataDir,
    });

    expect(findClothesByHash(hash, { dbPath })).toEqual({
      clothesId: item.id,
      versionId: item.latestVersionId,
      semver: "1.0.0",
    });
  });

  test("deleteClothesVersion recomputes latest and deleting last leaves empty parent", async () => {
    const item = await createClothes({
      gameId,
      authorId,
      semver: "1.0.0",
      fileBytes: await fixtureBytes("clothes", "kk_clothes.png"),
      dbPath,
      dataDir,
    });
    const v1Id = item.latestVersionId!;
    const v1Paths = getVersionPaths(item.id, v1Id, dataDir);

    const withV2 = await addClothesVersion({
      clothesId: item.id,
      authorId,
      semver: "2.0.0",
      fileBytes: await altClothesBytes(),
      dbPath,
      dataDir,
    });
    const v2Id = withV2.versions.find((v) => v.semver === "2.0.0")!.id;
    const v2Paths = getVersionPaths(item.id, v2Id, dataDir);
    expect(existsSync(v2Paths.versionDir)).toBe(true);

    const afterDeleteHigher = await deleteClothesVersion({
      clothesId: item.id,
      versionId: v2Id,
      authorId,
      dbPath,
      dataDir,
    });
    expect(afterDeleteHigher.latestSemver).toBe("1.0.0");
    expect(afterDeleteHigher.latestVersionId).toBe(v1Id);
    expect(afterDeleteHigher.versions.map((v) => v.semver)).toEqual(["1.0.0"]);
    expect(existsSync(v2Paths.versionDir)).toBe(false);
    expect(existsSync(v1Paths.versionDir)).toBe(true);

    let forbidden: unknown;
    try {
      await deleteClothesVersion({
        clothesId: item.id,
        versionId: v1Id,
        authorId: otherUserId,
        dbPath,
        dataDir,
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);

    const empty = await deleteClothesVersion({
      clothesId: item.id,
      versionId: v1Id,
      authorId,
      dbPath,
      dataDir,
    });
    expect(empty.latestSemver).toBeNull();
    expect(empty.latestVersionId).toBeNull();
    expect(empty.versions).toEqual([]);
    expect(existsSync(v1Paths.versionDir)).toBe(false);

    const listed = (await listClothes({ dbPath, dataDir })).items;
    const row = listed.find((c) => c.id === item.id);
    expect(row).toBeDefined();
    expect(row!.versionCount).toBe(0);
    expect(row!.latestSemver).toBeNull();
  });

  test("patchClothes and deleteClothes enforce author-only access", async () => {
    const fileBytes = await fixtureBytes("clothes", "kk_clothes.png");
    const item = await createClothes({
      gameId,
      semver: "1.0.0",
      authorId,
      title: "Before",
      fileBytes,
      dbPath,
      dataDir,
    });
    const contentHash = sha256Hex(fileBytes);

    let forbidden: unknown;
    try {
      await patchClothes({
        clothesId: item.id,
        authorId: otherUserId,
        title: "Hacked",
        dbPath,
        dataDir,
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);

    const patched = await patchClothes({
      clothesId: item.id,
      authorId,
      title: "After",
      dbPath,
      dataDir,
    });
    expect(patched.title).toBe("After");

    await deleteClothes({
      clothesId: item.id,
      authorId,
      dbPath,
      dataDir,
    });
    expect(await getClothes(item.id, { dbPath, dataDir })).toBeNull();
    expect(findContentBlob(contentHash, dbPath)).toEqual({ chunkCount: 1 });
  });

  test("legacy disk original_path is served when blob is absent", async () => {
    const db = getDb(dbPath);
    const planted = await plantLegacyClothesVersionOnDisk(db, {
      gameId,
      authorId,
      dataDir,
    });

    expect(findContentBlob(planted.contentHash, dbPath)).toBeNull();

    const file = await getClothesVersionImage(
      planted.clothesId,
      planted.versionId,
      { dbPath, dataDir, original: true },
    );
    expect(file).not.toBeNull();
    expect(Buffer.from(file!.bytes).equals(Buffer.from(planted.fileBytes))).toBe(
      true,
    );
  });

  test("deleteClothes keeps content blob after catalog row is removed", async () => {
    const db = getDb(dbPath);
    const planted = await plantClothesVersionWithBlob(db, {
      gameId,
      authorId,
      dbPath,
      dataDir,
    });

    await deleteClothes({
      clothesId: planted.clothesId,
      authorId,
      dbPath,
      dataDir,
    });

    expect(await getClothes(planted.clothesId, { dbPath, dataDir })).toBeNull();
    expect(findContentBlob(planted.contentHash, dbPath)).toEqual({
      chunkCount: 1,
    });
  });
});
