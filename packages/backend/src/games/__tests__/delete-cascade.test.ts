import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import {
  cardVotes,
  characterCardVersions,
  characterCards,
  clothes,
  clothesVersions,
  clothesVotes,
  gameContentKinds,
  games,
  pluginVersions,
  pluginVotes,
  plugins,
  sceneVersions,
  sceneVotes,
  scenes,
  softmodVersions,
  softmodVotes,
  softmods,
  users,
} from "../../db/schema";
import { gameIconsDir } from "../icons";
import { createGame, deleteGame, GameNotFoundError } from "../service";

type Db = ReturnType<typeof getDb>;

async function seedAllKinds(
  db: Db,
  gameId: string,
  userId: string,
  dataDir: string,
): Promise<string[]> {
  const now = new Date().toISOString();
  const paths: string[] = [];
  let hashN = 0;
  const nextHash = () => `hash-${gameId.slice(0, 8)}-${hashN++}`;

  const writeAt = async (rel: string) => {
    const path = join(dataDir, rel);
    mkdirSync(dirname(path), { recursive: true });
    await Bun.write(path, new Uint8Array([1, 2, 3]));
    paths.push(path);
    return path;
  };

  {
    const id = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const originalPath = await writeAt(`cards/${id}/${versionId}/original.png`);
    const previewPath = join(dataDir, `cards/${id}/${versionId}/preview.webp`);
    await Bun.write(previewPath, new Uint8Array([4]));
    db.insert(characterCards)
      .values({
        id,
        gameId,
        uploaderId: userId,
        description: "",
        latestSemver: "1.0.0",
        latestVersionId: versionId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(characterCardVersions)
      .values({
        id: versionId,
        cardId: id,
        semver: "1.0.0",
        notes: null,
        contentHash: nextHash(),
        originalPath,
        previewPath,
        summaryJson: "{}",
        createdAt: now,
      })
      .run();
    db.insert(cardVotes)
      .values({
        id: crypto.randomUUID(),
        cardId: id,
        userId,
        vote: "like",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  {
    const id = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const originalPath = await writeAt(`scenes/${id}/${versionId}/original.png`);
    const previewPath = join(dataDir, `scenes/${id}/${versionId}/preview.webp`);
    await Bun.write(previewPath, new Uint8Array([4]));
    db.insert(scenes)
      .values({
        id,
        gameId,
        uploaderId: userId,
        description: "",
        latestSemver: "1.0.0",
        latestVersionId: versionId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(sceneVersions)
      .values({
        id: versionId,
        sceneId: id,
        semver: "1.0.0",
        notes: null,
        contentHash: nextHash(),
        originalPath,
        previewPath,
        summaryJson: "{}",
        createdAt: now,
      })
      .run();
    db.insert(sceneVotes)
      .values({
        id: crypto.randomUUID(),
        sceneId: id,
        userId,
        vote: "like",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  {
    const id = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const originalPath = await writeAt(
      `clothes/${id}/${versionId}/original.png`,
    );
    const previewPath = join(
      dataDir,
      `clothes/${id}/${versionId}/preview.webp`,
    );
    await Bun.write(previewPath, new Uint8Array([4]));
    db.insert(clothes)
      .values({
        id,
        gameId,
        uploaderId: userId,
        description: "",
        latestSemver: "1.0.0",
        latestVersionId: versionId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(clothesVersions)
      .values({
        id: versionId,
        clothesId: id,
        semver: "1.0.0",
        notes: null,
        contentHash: nextHash(),
        originalPath,
        previewPath,
        summaryJson: "{}",
        createdAt: now,
      })
      .run();
    db.insert(clothesVotes)
      .values({
        id: crypto.randomUUID(),
        clothesId: id,
        userId,
        vote: "like",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  {
    const id = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const originalPath = await writeAt(`plugins/${id}/${versionId}/file.zip`);
    db.insert(plugins)
      .values({
        id,
        gameId,
        uploaderId: userId,
        title: "Plugin",
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
        pluginId: id,
        semver: "1.0.0",
        notes: null,
        contentHash: nextHash(),
        originalPath,
        summaryJson: "{}",
        createdAt: now,
      })
      .run();
    db.insert(pluginVotes)
      .values({
        id: crypto.randomUUID(),
        pluginId: id,
        userId,
        vote: "like",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  {
    const id = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const originalPath = await writeAt(`softmods/${id}/${versionId}/file.zip`);
    db.insert(softmods)
      .values({
        id,
        gameId,
        uploaderId: userId,
        description: "desc",
        website: null,
        latestSemver: "1.0.0",
        latestVersionId: versionId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(softmodVersions)
      .values({
        id: versionId,
        softmodId: id,
        semver: "1.0.0",
        notes: null,
        contentHash: nextHash(),
        originalPath,
        summaryJson: "{}",
        createdAt: now,
      })
      .run();
    db.insert(softmodVotes)
      .values({
        id: crypto.randomUUID(),
        softmodId: id,
        userId,
        vote: "like",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  return paths;
}

describe("game delete cascade", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let userId: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-game-cascade-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    Bun.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;
    Bun.env.DATA_DIR = dataDir;

    migrateDb(dbPath);
    const db = getDb(dbPath);
    userId = crypto.randomUUID();
    db.insert(users)
      .values({
        id: userId,
        discordId: "discord-cascade",
        username: "cascade_user",
        avatar: null,
        createdAt: new Date().toISOString(),
      })
      .run();
  });

  afterEach(() => {
    delete process.env.DATABASE_PATH;
    delete Bun.env.DATABASE_PATH;
    delete process.env.DATA_DIR;
    delete Bun.env.DATA_DIR;
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("deleting the game row cascades every kind and leaves the user, the other game, and the file", async () => {
    const kinds = [
      { kind: "cards" as const, relPath: null },
      { kind: "clothes" as const, relPath: null },
      { kind: "scenes" as const, relPath: null },
      { kind: "plugins" as const, relPath: null },
      { kind: "softmods" as const, relPath: null },
    ];
    const game = createGame({
      title: "Gone",
      createdByUserId: userId,
      dbPath,
      contentKinds: kinds,
    });
    const other = createGame({
      title: "Stays",
      createdByUserId: userId,
      dbPath,
      contentKinds: kinds,
    });
    const db = getDb(dbPath);
    const goneFiles = await seedAllKinds(db, game.id, userId, dataDir);
    await seedAllKinds(db, other.id, userId, dataDir);

    db.delete(games).where(eq(games.id, game.id)).run();

    expect(
      db.select().from(games).where(eq(games.id, game.id)).all(),
    ).toHaveLength(0);
    expect(
      db.select().from(users).where(eq(users.id, userId)).all(),
    ).toHaveLength(1);
    expect(
      db
        .select()
        .from(gameContentKinds)
        .where(eq(gameContentKinds.gameId, game.id))
        .all(),
    ).toHaveLength(0);
    expect(
      db
        .select()
        .from(gameContentKinds)
        .where(eq(gameContentKinds.gameId, other.id))
        .all(),
    ).toHaveLength(5);
    for (const table of [characterCards, scenes, clothes, plugins, softmods]) {
      const left = db.select().from(table).all();
      expect(left).toHaveLength(1);
      expect(left[0]!.gameId).toBe(other.id);
    }
    for (const table of [
      characterCardVersions,
      cardVotes,
      sceneVersions,
      sceneVotes,
      clothesVersions,
      clothesVotes,
      pluginVersions,
      pluginVotes,
      softmodVersions,
      softmodVotes,
    ]) {
      expect(db.select().from(table).all()).toHaveLength(1);
    }
    for (const path of goneFiles) expect(existsSync(path)).toBe(true);
  });

  test("deleteGame removes the icon directory and leaves the content file", async () => {
    const game = createGame({
      title: "Icons",
      createdByUserId: userId,
      dbPath,
      contentKinds: [{ kind: "cards", relPath: null }],
    });
    const db = getDb(dbPath);
    const [file] = await seedAllKinds(db, game.id, userId, dataDir);
    const icon = join(gameIconsDir(game.id, dataDir), "32.webp");
    mkdirSync(dirname(icon), { recursive: true });
    await Bun.write(icon, new Uint8Array([1, 2, 3]));

    deleteGame(game.id, { dbPath, dataDir });

    expect(existsSync(icon)).toBe(false);
    expect(existsSync(file!)).toBe(true);
    expect(() => deleteGame(game.id, { dbPath, dataDir })).toThrow(
      GameNotFoundError,
    );
  });
});
