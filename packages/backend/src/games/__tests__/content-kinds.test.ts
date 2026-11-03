import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { games, users } from "../../db/schema";
import {
  BadGameError,
  assertGameSupportsKind,
  createGame,
  getGame,
  patchGame,
} from "../service";

describe("game content kinds", () => {
  let tempDir: string;
  let dbPath: string;
  let userId: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-game-kinds-"));
    dbPath = join(tempDir, "test.db");
    process.env.DATABASE_PATH = dbPath;
    Bun.env.DATABASE_PATH = dbPath;

    migrateDb(dbPath);
    const db = getDb(dbPath);
    userId = crypto.randomUUID();
    db.insert(users)
      .values({
        id: userId,
        discordId: "discord-kinds",
        username: "kinds_user",
        avatar: null,
        createdAt: new Date().toISOString(),
      })
      .run();
  });

  afterEach(() => {
    delete process.env.DATABASE_PATH;
    delete Bun.env.DATABASE_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("createGame with kinds persists and getGame returns them", () => {
    const game = createGame({
      title: "Kinded",
      createdByUserId: userId,
      dbPath,
      contentKinds: [
        { kind: "cards", relPath: "UserData/cards" },
        { kind: "plugins", relPath: "  " },
      ],
    });
    expect(game.contentKinds).toEqual([
      { kind: "cards", relPath: "UserData/cards" },
      { kind: "plugins", relPath: null },
    ]);
    expect(getGame(game.id, { dbPath })!.contentKinds).toEqual(
      game.contentKinds,
    );
  });

  test("createGame defaults to empty contentKinds", () => {
    const game = createGame({
      title: "Bare",
      createdByUserId: userId,
      dbPath,
    });
    expect(game.contentKinds).toEqual([]);
  });

  test("patchGame replace-all clears and sets", () => {
    const game = createGame({
      title: "Patchable",
      createdByUserId: userId,
      dbPath,
      contentKinds: [
        { kind: "cards", relPath: null },
        { kind: "scenes", relPath: "scenes" },
      ],
    });
    const cleared = patchGame({
      id: game.id,
      dbPath,
      contentKinds: [],
    });
    expect(cleared.contentKinds).toEqual([]);

    const one = patchGame({
      id: game.id,
      dbPath,
      contentKinds: [{ kind: "clothes", relPath: "Mods/Clothes" }],
    });
    expect(one.contentKinds).toEqual([
      { kind: "clothes", relPath: "Mods/Clothes" },
    ]);
  });

  test("assertGameSupportsKind throws when disabled", () => {
    const game = createGame({
      title: "No kinds",
      createdByUserId: userId,
      dbPath,
    });
    expect(() =>
      assertGameSupportsKind(game.id, "cards", { dbPath }),
    ).toThrow(BadGameError);
    try {
      assertGameSupportsKind(game.id, "cards", { dbPath });
    } catch (err) {
      expect(err).toBeInstanceOf(BadGameError);
      expect((err as BadGameError).code).toBe("kind_not_supported");
    }
  });

  test("invalid relPath rejected before insert", () => {
    expect(() =>
      createGame({
        title: "Bad path",
        createdByUserId: userId,
        dbPath,
        contentKinds: [{ kind: "cards", relPath: "a/../b" }],
      }),
    ).toThrow(BadGameError);

    const db = getDb(dbPath);
    const rows = db.select().from(games).where(eq(games.title, "Bad path")).all();
    expect(rows).toHaveLength(0);
  });
});
