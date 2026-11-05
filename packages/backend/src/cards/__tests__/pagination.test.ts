import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedTestGame } from "../../__tests__/test-game";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import {
  cardVotes,
  characterCardVersions,
  characterCards,
  users,
} from "../../db/schema";
import { listCharacters } from "../service";
import { setCardVote } from "../votes";

describe("listCharacters pagination", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let voterId: string;
  let gameId: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-card-page-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;

    migrateDb(dbPath);
    const db = getDb(dbPath);
    authorId = crypto.randomUUID();
    voterId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.insert(users)
      .values([
        {
          id: authorId,
          discordId: "discord-page-author",
          username: "author",
          avatar: null,
          createdAt: now,
        },
        {
          id: voterId,
          discordId: "discord-page-voter",
          username: "voter",
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

  function plantCard(input: { createdAt: string; description?: string }): string {
    const db = getDb(dbPath);
    const cardId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    db.insert(characterCards)
      .values({
        id: cardId,
        gameId,
        uploaderId: authorId,
        description: input.description ?? "",
        latestSemver: "1.0.0",
        latestVersionId: versionId,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      })
      .run();
    db.insert(characterCardVersions)
      .values({
        id: versionId,
        cardId,
        semver: "1.0.0",
        notes: null,
        contentHash: `hash-${cardId}`,
        originalPath: null,
        previewPath: `preview/${versionId}.webp`,
        summaryJson: "{}",
        createdAt: input.createdAt,
      })
      .run();
    return cardId;
  }

  test("page/limit returns slice and total", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(
        plantCard({
          createdAt: new Date(2024, 0, i + 1).toISOString(),
        }),
      );
    }

    const page1 = await listCharacters({ page: 1, limit: 2, dbPath, dataDir });
    expect(page1.total).toBe(5);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(2);
    expect(page1.items).toHaveLength(2);
    // recent = newest first
    expect(page1.items.map((card) => card.id)).toEqual([ids[4], ids[3]]);

    const page2 = await listCharacters({ page: 2, limit: 2, dbPath, dataDir });
    expect(page2.total).toBe(5);
    expect(page2.items.map((card) => card.id)).toEqual([ids[2], ids[1]]);

    const page3 = await listCharacters({ page: 3, limit: 2, dbPath, dataDir });
    expect(page3.items.map((card) => card.id)).toEqual([ids[0]]);
  });

  test("q does not filter nameless cards", async () => {
    plantCard({ createdAt: "2024-01-01T00:00:00.000Z" });
    plantCard({ createdAt: "2024-01-02T00:00:00.000Z" });
    plantCard({ createdAt: "2024-01-03T00:00:00.000Z" });

    const listed = await listCharacters({
      page: 1,
      limit: 10,
      q: "hero",
      dbPath,
      dataDir,
    });
    expect(listed.total).toBe(3);
  });

  test("sort title falls back to recent and top uses vote score", async () => {
    const oldest = plantCard({
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    const middle = plantCard({
      createdAt: "2024-01-02T00:00:00.000Z",
    });
    const newest = plantCard({
      createdAt: "2024-01-03T00:00:00.000Z",
    });

    const byTitle = await listCharacters({
      page: 1,
      limit: 10,
      sort: "title",
      dbPath,
      dataDir,
    });
    expect(byTitle.items.map((card) => card.id)).toEqual([
      newest,
      middle,
      oldest,
    ]);

    setCardVote({ cardId: oldest, userId: voterId, vote: "like", dbPath });
    setCardVote({
      cardId: middle,
      userId: voterId,
      vote: "dislike",
      dbPath,
    });
    // second like on Charlie via another vote row — use author as second voter
    const db = getDb(dbPath);
    const now = new Date().toISOString();
    db.insert(cardVotes)
      .values({
        id: crypto.randomUUID(),
        cardId: oldest,
        userId: authorId,
        vote: "like",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const byTop = await listCharacters({
      page: 1,
      limit: 10,
      sort: "top",
      dbPath,
      dataDir,
    });
    expect(byTop.items[0]!.id).toBe(oldest);
    expect(byTop.items[0]!.likes).toBe(2);
    expect(byTop.items.at(-1)!.id).toBe(middle);
  });

  test("unbounded uploaderId returns all without page defaults", async () => {
    for (let i = 0; i < 3; i++) {
      plantCard({
        createdAt: new Date(2024, 0, i + 1).toISOString(),
      });
    }
    const result = await listCharacters({
      uploaderId: authorId,
      unbounded: true,
      dbPath,
      dataDir,
    });
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(3);
  });
});
