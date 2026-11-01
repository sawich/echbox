import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { softmodVotes, users } from "../../db/schema";
import { eq } from "drizzle-orm";
import { fixtureBytes } from "../../kkloader/__tests__/helpers";
import { sha256Hex } from "../../cards/hash";
import {
  addSoftmodVersion,
  createSoftmod,
  deleteSoftmod,
  findSoftmodByHash,
  getSoftmod,
  listSoftmods,
} from "../service";
import { softmodVersionPaths } from "../storage";
import { setSoftmodVote } from "../votes";
import { seedTestGame } from "../../__tests__/test-game";

function zipmodWithGuid(
  guid: string,
  packageVersion = "1.2.3",
  extraPayload = "payload-a",
  fields?: {
    name?: string;
    author?: string;
    description?: string;
  },
): Uint8Array {
  const name = fields?.name ?? "Test Mod";
  const author = fields?.author ?? "Tester";
  const description = fields?.description ?? "A test mod";
  const manifest = `<?xml version="1.0"?>
<Manifest>
  <guid>${guid}</guid>
  <name>${name}</name>
  <version>${packageVersion}</version>
  <author>${author}</author>
  <description>${description}</description>
</Manifest>`;
  return zipSync({
    "manifest.xml": strToU8(manifest),
    "data.txt": strToU8(extraPayload),
  });
}

describe("softmod service", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let gameId: string;
  let otherUserId: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-softmod-svc-"));
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
          discordId: "discord-softmod-author",
          username: "softmod_author",
          avatar: null,
          createdAt: now,
        },
        {
          id: otherUserId,
          discordId: "discord-softmod-other",
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

  test("createSoftmod stores zipmod from fixture and uses manifest GUID as id", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const created = await createSoftmod({ gameId,
      authorId,
      fileBytes,
      notes: "First release",
      dbPath,
      dataDir,
    });

    expect(created.id).toBe("com.echbox.testmod");
    expect(created.title).toBe("Test Mod");
    expect(created.modAuthor).toBe("Tester");
    expect(created.latestVersion).toBe(1);
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]!.packageVersion).toBe("1.2.3");
    expect(created.versions[0]!.notes).toBe("First release");
    expect(created.versions[0]!.downloadUrl).toBe(
      "/api/softmods/com.echbox.testmod/versions/1/download",
    );
    expect(created.uploader).toEqual({
      id: authorId,
      username: "softmod_author",
    });
    expect(created.likes).toBe(0);
    expect(created.dislikes).toBe(0);

    const paths = softmodVersionPaths(dataDir, created.id, 1);
    expect(existsSync(paths.originalPath)).toBe(true);
    const saved = new Uint8Array(
      await Bun.file(paths.originalPath).arrayBuffer(),
    );
    expect(Buffer.from(saved).equals(Buffer.from(fileBytes))).toBe(true);

    const list = await listSoftmods({ dbPath, dataDir });
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe("com.echbox.testmod");
    expect(list[0]!.downloadUrl).toBe(
      "/api/softmods/com.echbox.testmod/versions/1/download",
    );

    const fetched = await getSoftmod("com.echbox.testmod", { dbPath, dataDir });
    expect(fetched).not.toBeNull();
    expect(fetched!.uploader.username).toBe("softmod_author");
  });

  test("second createSoftmod with same GUID throws SoftmodGuidConflictError", async () => {
    const guid = "com.echbox.guid-conflict";
    const firstBytes = zipmodWithGuid(guid, "1.0.0", "first");
    const secondBytes = zipmodWithGuid(guid, "2.0.0", "second");

    await createSoftmod({ gameId, authorId, fileBytes: firstBytes, dbPath, dataDir });

    let caught: unknown;
    try {
      await createSoftmod({ gameId,
        authorId: otherUserId,
        fileBytes: secondBytes,
        dbPath,
        dataDir,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    const conflict = caught as { status: number; softmodId: string; name: string };
    expect(conflict.status).toBe(409);
    expect(conflict.softmodId).toBe(guid);
    expect(conflict.name).toBe("SoftmodGuidConflictError");

    const list = await listSoftmods({ dbPath, dataDir });
    expect(list).toHaveLength(1);
  });

  test("second createSoftmod with same file bytes throws DuplicateSoftmodHashError", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    await createSoftmod({ gameId, authorId, fileBytes, dbPath, dataDir });

    let caught: unknown;
    try {
      await createSoftmod({ gameId,
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
      softmodId: string;
      version: number;
      name: string;
    };
    expect(conflict.status).toBe(409);
    expect(conflict.name).toBe("DuplicateSoftmodHashError");
    expect(conflict.softmodId).toBe("com.echbox.testmod");
    expect(conflict.version).toBe(1);
  });

  test("addSoftmodVersion bumps version, refreshes metadata, and writes v2 file", async () => {
    const guid = "com.echbox.version-bump";
    const v1Bytes = zipmodWithGuid(guid, "1.0.0", "v1-data");
    const created = await createSoftmod({ gameId,
      authorId,
      fileBytes: v1Bytes,
      dbPath,
      dataDir,
    });

    expect(created.title).toBe("Test Mod");
    expect(created.modAuthor).toBe("Tester");

    const v2Bytes = zipmodWithGuid(guid, "2.0.0", "v2-data-padded-extra", {
      name: "Renamed Mod",
      author: "New Author",
      description: "Updated description",
    });

    const updated = await addSoftmodVersion({
      softmodId: guid,
      authorId,
      fileBytes: v2Bytes,
      notes: "Second release",
      dbPath,
      dataDir,
    });

    expect(updated.latestVersion).toBe(2);
    expect(updated.title).toBe("Renamed Mod");
    expect(updated.modAuthor).toBe("New Author");
    expect(updated.description).toBe("Updated description");
    expect(updated.versions).toHaveLength(2);
    expect(updated.versions[1]!.version).toBe(2);
    expect(updated.versions[1]!.packageVersion).toBe("2.0.0");
    expect(updated.versions[1]!.notes).toBe("Second release");
    expect(updated.downloadUrl).toBe(
      `/api/softmods/${guid}/versions/2/download`,
    );

    const v2Paths = softmodVersionPaths(dataDir, guid, 2);
    expect(existsSync(v2Paths.originalPath)).toBe(true);
    const savedV2 = new Uint8Array(
      await Bun.file(v2Paths.originalPath).arrayBuffer(),
    );
    expect(Buffer.from(savedV2).equals(Buffer.from(v2Bytes))).toBe(true);
  });

  test("addSoftmodVersion as non-author throws 403", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const created = await createSoftmod({ gameId,
      authorId,
      fileBytes,
      dbPath,
      dataDir,
    });

    const v2Bytes = zipmodWithGuid(created.id, "2.0.0", "v2-payload");

    let caught: unknown;
    try {
      await addSoftmodVersion({
        softmodId: created.id,
        authorId: otherUserId,
        fileBytes: v2Bytes,
        dbPath,
        dataDir,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(403);
    expect(
      existsSync(softmodVersionPaths(dataDir, created.id, 2).originalPath),
    ).toBe(false);
  });

  test("findSoftmodByHash returns softmodId and version when present", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const hash = sha256Hex(fileBytes);

    expect(await findSoftmodByHash(hash, { dbPath })).toBeNull();

    await createSoftmod({ gameId, authorId, fileBytes, dbPath, dataDir });

    expect(await findSoftmodByHash(hash, { dbPath })).toEqual({
      softmodId: "com.echbox.testmod",
      version: 1,
    });
  });

  test("deleteSoftmod removes DB rows and files for author only", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const created = await createSoftmod({ gameId,
      authorId,
      fileBytes,
      dbPath,
      dataDir,
    });
    const paths = softmodVersionPaths(dataDir, created.id, 1);
    expect(existsSync(paths.originalPath)).toBe(true);

    let forbidden: unknown;
    try {
      await deleteSoftmod({
        softmodId: created.id,
        authorId: otherUserId,
        dbPath,
        dataDir,
      });
    } catch (err) {
      forbidden = err;
    }
    expect((forbidden as { status: number }).status).toBe(403);

    await deleteSoftmod({
      softmodId: created.id,
      authorId,
      dbPath,
      dataDir,
    });

    expect(await getSoftmod(created.id, { dbPath })).toBeNull();
    expect(await findSoftmodByHash(sha256Hex(fileBytes), { dbPath })).toBeNull();
    expect(existsSync(paths.originalPath)).toBe(false);
  });

  test("deleteSoftmod removes seeded votes", async () => {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const created = await createSoftmod({ gameId,
      authorId,
      fileBytes,
      dbPath,
      dataDir,
    });

    setSoftmodVote({
      softmodId: created.id,
      userId: otherUserId,
      vote: "like",
      dbPath,
    });

    const db = getDb(dbPath);
    expect(
      db
        .select()
        .from(softmodVotes)
        .where(eq(softmodVotes.softmodId, created.id))
        .all(),
    ).toHaveLength(1);

    await deleteSoftmod({
      softmodId: created.id,
      authorId,
      dbPath,
      dataDir,
    });

    expect(await getSoftmod(created.id, { dbPath })).toBeNull();
    expect(
      db
        .select()
        .from(softmodVotes)
        .where(eq(softmodVotes.softmodId, created.id))
        .all(),
    ).toHaveLength(0);
  });
});
