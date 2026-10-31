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
  findByHash,
  getCard,
  listCharacters,
  patchCard,
} from "../service";
import { getVersionPaths } from "../storage";

describe("character card service", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
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
  });

  afterEach(() => {
    delete process.env.DATABASE_PATH;
    delete process.env.DATA_DIR;
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("createCard stores original PNG, WebP preview, and DB rows", async () => {
    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const created = await createCard({
      authorId,
      title: "Heroine Card",
      fileBytes,
      notes: "Initial upload",
    });

    expect(created.id).toBeString();
    expect(created.title).toBe("Heroine Card");
    expect(created.latestVersion).toBe(1);
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]!.version).toBe(1);
    expect(created.versions[0]!.notes).toBe("Initial upload");

    const paths = getVersionPaths(created.id, 1, dataDir);
    expect(existsSync(paths.originalPath)).toBe(true);
    expect(existsSync(paths.previewPath)).toBe(true);

    const savedOriginal = new Uint8Array(
      await Bun.file(paths.originalPath).arrayBuffer(),
    );
    expect(Buffer.from(savedOriginal).equals(Buffer.from(fileBytes))).toBe(
      true,
    );

    const savedPreview = new Uint8Array(
      await Bun.file(paths.previewPath).arrayBuffer(),
    );
    expect(String.fromCharCode(...savedPreview.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...savedPreview.slice(8, 12))).toBe("WEBP");

    const list = await listCharacters();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(created.id);
    expect(list[0]!.title).toBe("Heroine Card");
    expect(list[0]!.latestVersion).toBe(1);
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
      authorId,
      title: "First Character",
      fileBytes: firstBytes,
    });
    const second = await createCard({
      authorId: otherUserId,
      title: "Second Character",
      fileBytes: secondBytes,
    });

    expect(first.id).not.toBe(second.id);
    const list = await listCharacters();
    expect(list).toHaveLength(2);
  });

  test("second createCard with same file throws 409 conflict with cardId and version", async () => {
    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const first = await createCard({
      authorId,
      fileBytes,
    });

    let caught: unknown;
    try {
      await createCard({
        authorId: otherUserId,
        fileBytes,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    const conflict = caught as {
      status: number;
      cardId: string;
      version: number;
    };
    expect(conflict.status).toBe(409);
    expect(conflict.cardId).toBe(first.id);
    expect(conflict.version).toBe(1);

    const list = await listCharacters();
    expect(list).toHaveLength(1);
  });

  test("addVersion adds v2 for author and rejects duplicate bytes with 409", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const v2Bytes = await fixtureBytes("chara", "kk_mod_chara.png");

    const card = await createCard({
      authorId,
      title: "Evolving Card",
      fileBytes: v1Bytes,
    });

    const updated = await addVersion({
      cardId: card.id,
      authorId,
      fileBytes: v2Bytes,
      notes: "Added mod data",
    });

    expect(updated.latestVersion).toBe(2);
    expect(updated.versions).toHaveLength(2);
    expect(updated.versions[1]!.version).toBe(2);
    expect(updated.versions[1]!.notes).toBe("Added mod data");

    const v2Paths = getVersionPaths(card.id, 2, dataDir);
    expect(existsSync(v2Paths.originalPath)).toBe(true);
    expect(existsSync(v2Paths.previewPath)).toBe(true);

    // Re-uploading v1Bytes as a new version must 409
    let caught: unknown;
    try {
      await addVersion({
        cardId: card.id,
        authorId,
        fileBytes: v1Bytes,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    const conflict = caught as {
      status: number;
      cardId: string;
      version: number;
    };
    expect(conflict.status).toBe(409);
    expect(conflict.cardId).toBe(card.id);
    expect(conflict.version).toBe(1);
  });

  test("addVersion as non-author throws 403", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const v2Bytes = await fixtureBytes("chara", "kk_mod_chara.png");

    const card = await createCard({
      authorId,
      fileBytes: v1Bytes,
    });

    let caught: unknown;
    try {
      await addVersion({
        cardId: card.id,
        authorId: otherUserId,
        fileBytes: v2Bytes,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(403);
    expect(existsSync(getVersionPaths(card.id, 2, dataDir).originalPath)).toBe(
      false,
    );
  });

  test("findByHash returns cardId and version when present, null otherwise", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const hash = sha256Hex(v1Bytes);

    expect(await findByHash(hash)).toBeNull();

    const card = await createCard({
      authorId,
      fileBytes: v1Bytes,
    });

    expect(await findByHash(hash)).toEqual({
      cardId: card.id,
      version: 1,
    });
  });

  test("bad card bytes throw 400 and write no files", async () => {
    const badBytes = new TextEncoder().encode("not-a-koikatsu-png");

    let caught: unknown;
    try {
      await createCard({
        authorId,
        fileBytes: badBytes,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(400);
    expect(await listCharacters()).toHaveLength(0);

    // Coordinate card is a PNG with Koikatsu clothes header, not a character card
    const coordBytes = await fixtureBytes("coordinate", "kk_coordinate.png");
    let coordCaught: unknown;
    try {
      await createCard({
        authorId,
        fileBytes: coordBytes,
      });
    } catch (err) {
      coordCaught = err;
    }
    expect(coordCaught).toBeDefined();
    expect((coordCaught as { status: number }).status).toBe(400);
    expect(await listCharacters()).toHaveLength(0);
  });

  test("patchCard updates metadata for author and throws 403 for other user", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const card = await createCard({
      authorId,
      title: "Before Title",
      fileBytes: v1Bytes,
    });

    let forbidden: unknown;
    try {
      await patchCard({
        cardId: card.id,
        authorId: otherUserId,
        title: "Hacked Title",
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);

    const patched = await patchCard({
      cardId: card.id,
      authorId,
      title: "After Title",
      slug: "after-title",
      notes: "Updated note",
    });

    expect(patched.title).toBe("After Title");
    expect(patched.slug).toBe("after-title");
    expect(patched.versions[0]!.notes).toBe("Updated note");
  });

  test("deleteCard throws 403 for other user and removes DB + files for author", async () => {
    const v1Bytes = await fixtureBytes("chara", "kk_chara.png");
    const card = await createCard({
      authorId,
      fileBytes: v1Bytes,
    });

    const paths = getVersionPaths(card.id, 1, dataDir);
    expect(existsSync(paths.originalPath)).toBe(true);

    let forbidden: unknown;
    try {
      await deleteCard({
        cardId: card.id,
        authorId: otherUserId,
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);
    expect(existsSync(paths.originalPath)).toBe(true);

    await deleteCard({
      cardId: card.id,
      authorId,
    });

    expect(await getCard(card.id)).toBeNull();
    expect(await findByHash(sha256Hex(v1Bytes))).toBeNull();
    expect(existsSync(paths.originalPath)).toBe(false);
    expect(existsSync(paths.previewPath)).toBe(false);
  });
});
