import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { users } from "../../db/schema";
import { fixtureBytes } from "../../kkloader/__tests__/helpers";
import { sha256Hex } from "../hash";
import {
  addVersion,
  createCard,
  deleteCard,
  deleteVersion,
  findByHash,
  getCard,
  getVersionImage,
  listCharacters,
  patchCard,
} from "../service";
import { getVersionPaths } from "../storage";
import { seedTestGame } from "../../__tests__/test-game";
import { findContentBlob } from "../../proxy/blob-store";
import { setContentTags } from "../../tags/service";
import {
  plantCardVersionWithBlob,
  plantLegacyCardVersionOnDisk,
} from "../../__tests__/image-content-blob-helpers";

describe("character card service", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let gameId: string;
  let otherUserId: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-card-svc-"));
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
          discordId: "discord-author",
          username: "author",
          avatar: null,
          createdAt: now,
        },
        {
          id: otherUserId,
          discordId: "discord-other",
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

  test("createCard stores original PNG, WebP preview, and DB rows", async () => {
    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const created = await createCard({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      description: "Heroine Card",
      fileBytes,
      notes: "Initial upload",
    });

    expect(created.id).toBeString();
    expect(created.uploaderId).toBe(authorId);
    expect(created.description).toBe("Heroine Card");
    expect(created).not.toHaveProperty("title");
    expect(created).not.toHaveProperty("slug");
    expect(created.latestSemver).toBe("1.0.0");
    expect(created.latestVersionId).toBe(created.versions[0]!.id);
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]!.semver).toBe("1.0.0");
    expect(created.versions[0]!.notes).toBe("Initial upload");

    const paths = getVersionPaths(created.id, created.latestVersionId, dataDir);
    expect(paths.versionDir.endsWith(created.latestVersionId)).toBe(true);
    expect(existsSync(paths.originalPath)).toBe(false);
    expect(existsSync(paths.previewPath)).toBe(true);
    expect(findContentBlob(sha256Hex(fileBytes), dbPath)).toEqual({
      chunkCount: 1,
    });

    const savedOriginal = await getVersionImage(
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

    const list = (await listCharacters()).items;
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(created.id);
    expect(list[0]!.uploaderId).toBe(authorId);
    expect(list[0]!.description).toBe("Heroine Card");
    expect(list[0]).not.toHaveProperty("title");
    expect(list[0]!.latestSemver).toBe("1.0.0");
    expect(list[0]!.latestVersionId).toBe(created.latestVersionId);
    expect(list[0]!.versionCount).toBe(1);

    const fetched = await getCard(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.versions).toHaveLength(1);
  });

  test("two createCard calls with distinct fixture files succeed", async () => {
    const firstBytes = await fixtureBytes("chara", "kk_chara.png");
    const secondBytes = await fixtureBytes("chara", "kk_mod_chara.png");

    const first = await createCard({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes: firstBytes,
    });
    const second = await createCard({
      gameId,
      semver: "1.0.0",
      uploaderId: otherUserId,
      fileBytes: secondBytes,
    });

    expect(first.id).not.toBe(second.id);
    const list = (await listCharacters()).items;
    expect(list).toHaveLength(2);
  });

  test("second createCard with same file throws 409 conflict with cardId and version", async () => {
    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const first = await createCard({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes,
    });

    let caught: unknown;
    try {
      await createCard({
      gameId,
      semver: "1.0.0",
        uploaderId: otherUserId,
        fileBytes,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    const conflict = caught as {
      status: number;
      cardId: string;
      versionId: string;
      semver: string;
    };
    expect(conflict.status).toBe(409);
    expect(conflict.cardId).toBe(first.id);
    expect(conflict.versionId).toBe(first.latestVersionId);
    expect(conflict.semver).toBe("1.0.0");

    const list = (await listCharacters()).items;
    expect(list).toHaveLength(1);
  });

  test("addVersion adds v2 for author and rejects duplicate bytes with 409", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const v2Bytes = await fixtureBytes("chara", "kk_mod_chara.png");

    const card = await createCard({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes: v1Bytes,
    });

    const updated = await addVersion({
      cardId: card.id,
      semver: "2.0.0",
      uploaderId: authorId,
      fileBytes: v2Bytes,
      notes: "Added mod data",
    });

    expect(updated.latestSemver).toBe("2.0.0");
    expect(updated.latestVersionId).toBe(updated.versions[1]!.id);
    expect(updated.versions).toHaveLength(2);
    expect(updated.versions[1]!.semver).toBe("2.0.0");
    expect(updated.versions[1]!.notes).toBe("Added mod data");

    const v2Paths = getVersionPaths(card.id, updated.latestVersionId, dataDir);
    expect(existsSync(v2Paths.originalPath)).toBe(false);
    expect(existsSync(v2Paths.previewPath)).toBe(true);

    // Re-uploading v1Bytes as a new version must 409
    let caught: unknown;
    try {
      await addVersion({
        cardId: card.id,
        semver: "2.0.0",
        uploaderId: authorId,
        fileBytes: v1Bytes,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    const conflict = caught as {
      status: number;
      cardId: string;
      versionId: string;
      semver: string;
    };
    expect(conflict.status).toBe(409);
    expect(conflict.cardId).toBe(card.id);
    expect(conflict.versionId).toBe(card.latestVersionId);
    expect(conflict.semver).toBe("1.0.0");
  });

  test("addVersion as non-author throws 403", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const v2Bytes = await fixtureBytes("chara", "kk_mod_chara.png");

    const card = await createCard({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes: v1Bytes,
    });

    let caught: unknown;
    try {
      await addVersion({
        cardId: card.id,
        semver: "2.0.0",
        uploaderId: otherUserId,
        fileBytes: v2Bytes,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(403);
    expect(
      existsSync(getVersionPaths(card.id, "unused-version-id", dataDir).originalPath),
    ).toBe(false);
    expect((await getCard(card.id))!.versions).toHaveLength(1);
  });

  test("addVersion rejects duplicate semver on same card with 409 DUPLICATE_SEMVER", async () => {
    const card = await createCard({
      gameId,
      uploaderId: authorId,
      semver: "1.0.0",
      fileBytes: await fixtureBytes("chara", "kk_chara.png"),
    });

    let caught: unknown;
    try {
      await addVersion({
        cardId: card.id,
        uploaderId: authorId,
        semver: "v1.0.0",
        fileBytes: await fixtureBytes("chara", "kk_mod_chara.png"),
      });
    } catch (err) {
      caught = err;
    }
    const err = caught as { status: number; code: string; semver: string };
    expect(err.status).toBe(409);
    expect(err.code).toBe("DUPLICATE_SEMVER");
    expect(err.semver).toBe("1.0.0");
  });

  test("createCard and addVersion reject missing or invalid semver with 400", async () => {
    const bytes = await fixtureBytes("chara", "kk_chara.png");
    for (const bad of ["", "   ", "not-a-version"]) {
      let caught: unknown;
      try {
        await createCard({ gameId, uploaderId: authorId, semver: bad, fileBytes: bytes });
      } catch (err) {
        caught = err;
      }
      expect((caught as { status: number }).status).toBe(400);
    }
    expect((await listCharacters()).items).toHaveLength(0);

    const card = await createCard({
      gameId,
      uploaderId: authorId,
      semver: "1.0.0",
      fileBytes: bytes,
    });
    let caught: unknown;
    try {
      await addVersion({
        cardId: card.id,
        uploaderId: authorId,
        semver: "nope",
        fileBytes: await fixtureBytes("chara", "kk_mod_chara.png"),
      });
    } catch (err) {
      caught = err;
    }
    expect((caught as { status: number }).status).toBe(400);
  });

  test("latest is chosen by semver, not insertion order", async () => {
    const card = await createCard({
      gameId,
      uploaderId: authorId,
      semver: "2.0.0",
      fileBytes: await fixtureBytes("chara", "kk_chara.png"),
    });
    const updated = await addVersion({
      cardId: card.id,
      uploaderId: authorId,
      semver: "1.5.0",
      fileBytes: await fixtureBytes("chara", "kk_mod_chara.png"),
    });
    expect(updated.latestSemver).toBe("2.0.0");
    expect(updated.latestVersionId).toBe(card.latestVersionId);
    expect(updated.versions.map((v) => v.semver)).toEqual(["1.5.0", "2.0.0"]);
  });

  test("deleteVersion recomputes latest and deleting last leaves empty parent", async () => {
    const card = await createCard({
      gameId,
      uploaderId: authorId,
      semver: "1.0.0",
      fileBytes: await fixtureBytes("chara", "kk_chara.png"),
    });
    const v1Id = card.latestVersionId!;
    const v1Paths = getVersionPaths(card.id, v1Id, dataDir);

    const withV2 = await addVersion({
      cardId: card.id,
      uploaderId: authorId,
      semver: "2.0.0",
      fileBytes: await fixtureBytes("chara", "kk_mod_chara.png"),
    });
    const v2Id = withV2.versions.find((v) => v.semver === "2.0.0")!.id;
    const v2Paths = getVersionPaths(card.id, v2Id, dataDir);
    expect(existsSync(v2Paths.versionDir)).toBe(true);

    const afterDeleteHigher = await deleteVersion({
      cardId: card.id,
      versionId: v2Id,
      uploaderId: authorId,
    });
    expect(afterDeleteHigher.latestSemver).toBe("1.0.0");
    expect(afterDeleteHigher.latestVersionId).toBe(v1Id);
    expect(afterDeleteHigher.versions.map((v) => v.semver)).toEqual(["1.0.0"]);
    expect(existsSync(v2Paths.versionDir)).toBe(false);
    expect(existsSync(v1Paths.versionDir)).toBe(true);

    let forbidden: unknown;
    try {
      await deleteVersion({
        cardId: card.id,
        versionId: v1Id,
        uploaderId: otherUserId,
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);

    let missing: unknown;
    try {
      await deleteVersion({
        cardId: card.id,
        versionId: crypto.randomUUID(),
        uploaderId: authorId,
      });
    } catch (err) {
      missing = err;
    }
    expect((missing as { status: number }).status).toBe(404);

    const empty = await deleteVersion({
      cardId: card.id,
      versionId: v1Id,
      uploaderId: authorId,
    });
    expect(empty.latestSemver).toBeNull();
    expect(empty.latestVersionId).toBeNull();
    expect(empty.versions).toEqual([]);
    expect(existsSync(v1Paths.versionDir)).toBe(false);

    const listed = (await listCharacters()).items;
    const item = listed.find((c) => c.id === card.id);
    expect(item).toBeDefined();
    expect(item!.versionCount).toBe(0);
    expect(item!.latestSemver).toBeNull();
    expect(item!.imageUrl).toBe("");

    const stillThere = await getCard(card.id);
    expect(stillThere).not.toBeNull();
    expect(stillThere!.versions).toEqual([]);
  });

  test("findByHash returns cardId, versionId and semver when present, null otherwise", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const hash = sha256Hex(v1Bytes);

    expect(await findByHash(hash)).toBeNull();

    const card = await createCard({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes: v1Bytes,
    });

    expect(await findByHash(hash)).toEqual({
      cardId: card.id,
      versionId: card.latestVersionId,
      semver: "1.0.0",
    });
  });

  test("bad card bytes throw 400 and write no files", async () => {
    const badBytes = new TextEncoder().encode("not-a-koikatsu-png");

    let caught: unknown;
    try {
      await createCard({
      gameId,
      semver: "1.0.0",
        uploaderId: authorId,
        fileBytes: badBytes,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(400);
    expect((await listCharacters()).items).toHaveLength(0);

    // Coordinate card is a PNG with Koikatsu clothes header, not a character card
    const coordBytes = await fixtureBytes("coordinate", "kk_coordinate.png");
    let coordCaught: unknown;
    try {
      await createCard({
      gameId,
      semver: "1.0.0",
        uploaderId: authorId,
        fileBytes: coordBytes,
      });
    } catch (err) {
      coordCaught = err;
    }
    expect(coordCaught).toBeDefined();
    expect((coordCaught as { status: number }).status).toBe(400);
    expect((await listCharacters()).items).toHaveLength(0);
  });

  test("plain PNG (no card payload) rejects with human message, not Out of bounds", async () => {
    const card = await createCard({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes: await fixtureBytes("chara", "kk_chara.png"),
    });

    // Valid PNG signature only — previously surfaced as DataView "Out of bounds access"
    const pngOnly = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    let caught: unknown;
    try {
      await addVersion({
        cardId: card.id,
        uploaderId: authorId,
        semver: "1.2.0",
        fileBytes: pngOnly,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(400);
    expect((caught as Error).message).toBe(
      "Uploaded file is not a valid Koikatsu character card",
    );
    expect((caught as Error).message).not.toMatch(/out of bounds/i);
  });

  test("patchCard updates metadata for author and throws 403 for other user", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const card = await createCard({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      description: "Before",
      fileBytes: v1Bytes,
    });

    let forbidden: unknown;
    try {
      await patchCard({
        cardId: card.id,
        uploaderId: otherUserId,
        description: "Hacked",
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);
    expect((await getCard(card.id))!.description).toBe("Before");

    const patched = await patchCard({
      cardId: card.id,
      uploaderId: authorId,
      description: "After Title",
      notes: "Updated note",
    });

    expect(patched.description).toBe("After Title");
    expect(patched).not.toHaveProperty("title");
    expect(patched).not.toHaveProperty("slug");
    expect(patched.versions[0]!.notes).toBe("Updated note");
  });

  test("listCharacters with tags returns only cards that have every tag", async () => {
    const bothBytes = await fixtureBytes("chara", "kk_chara.png");
    const onlyABytes = await fixtureBytes("chara", "kk_mod_chara.png");
    const both = await createCard({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      description: "both",
      fileBytes: bothBytes,
      dbPath,
      dataDir,
    });
    const onlyA = await createCard({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      description: "only a",
      fileBytes: onlyABytes,
      dbPath,
      dataDir,
    });

    const actor = { userId: authorId, isAdmin: false };
    setContentTags({
      kind: "cards",
      contentId: both.id,
      names: ["a", "b"],
      actor,
      uploaderId: authorId,
      dbPath,
    });
    setContentTags({
      kind: "cards",
      contentId: onlyA.id,
      names: ["a"],
      actor,
      uploaderId: authorId,
      dbPath,
    });

    const filtered = await listCharacters({
      tags: ["a", "b"],
      dbPath,
      dataDir,
    });
    expect(filtered.total).toBe(1);
    expect(filtered.items.map((card) => card.id)).toEqual([both.id]);

    const unfiltered = await listCharacters({ dbPath, dataDir });
    expect(unfiltered.total).toBe(2);
  });

  test("deleteCard throws 403 for other user and removes DB + files for author", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const contentHash = sha256Hex(v1Bytes);
    const card = await createCard({
      gameId,
      semver: "1.0.0",
      uploaderId: authorId,
      fileBytes: v1Bytes,
    });

    const paths = getVersionPaths(card.id, card.latestVersionId, dataDir);
    expect(existsSync(paths.originalPath)).toBe(false);

    let forbidden: unknown;
    try {
      await deleteCard({
        cardId: card.id,
        uploaderId: otherUserId,
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);
    expect(existsSync(paths.originalPath)).toBe(false);

    await deleteCard({
      cardId: card.id,
      uploaderId: authorId,
    });

    expect(await getCard(card.id)).toBeNull();
    expect(await findByHash(contentHash)).toBeNull();
    expect(findContentBlob(contentHash, dbPath)).toEqual({ chunkCount: 1 });
    expect(existsSync(paths.originalPath)).toBe(false);
    expect(existsSync(paths.previewPath)).toBe(false);
  });

  test("legacy disk original_path is served when blob is absent", async () => {
    const db = getDb(dbPath);
    const planted = await plantLegacyCardVersionOnDisk(db, {
      gameId,
      uploaderId: authorId,
      dataDir,
    });

    expect(findContentBlob(planted.contentHash, dbPath)).toBeNull();

    const file = await getVersionImage(planted.cardId, planted.versionId, {
      dbPath,
      dataDir,
      original: true,
    });
    expect(file).not.toBeNull();
    expect(Buffer.from(file!.bytes).equals(Buffer.from(planted.fileBytes))).toBe(
      true,
    );
  });

  test("deleteCard keeps content blob after catalog row is removed", async () => {
    const db = getDb(dbPath);
    const planted = await plantCardVersionWithBlob(db, {
      gameId,
      uploaderId: authorId,
      dbPath,
      dataDir,
    });

    await deleteCard({
      cardId: planted.cardId,
      uploaderId: authorId,
    });

    expect(await getCard(planted.cardId)).toBeNull();
    expect(findContentBlob(planted.contentHash, dbPath)).toEqual({
      chunkCount: 1,
    });
  });
});
