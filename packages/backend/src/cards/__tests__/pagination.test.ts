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

  function plantCard(input: {
    title: string;
    slug: string;
    createdAt: string;
  }): string {
    const db = getDb(dbPath);
    const cardId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    db.insert(characterCards)
      .values({
        id: cardId,
        gameId,
        authorId,
        slug: input.slug,
        title: input.title,
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
    for (let i = 0; i < 5; i++) {
      plantCard({
        title: `Card ${i}`,
        slug: `card-${i}`,
        createdAt: new Date(2024, 0, i + 1).toISOString(),
      });
    }

    const page1 = await listCharacters({ page: 1, limit: 2, dbPath, dataDir });
    expect(page1.total).toBe(5);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(2);
    expect(page1.items).toHaveLength(2);
    // recent = newest first
    expect(page1.items[0]!.title).toBe("Card 4");
    expect(page1.items[1]!.title).toBe("Card 3");

    const page2 = await listCharacters({ page: 2, limit: 2, dbPath, dataDir });
    expect(page2.total).toBe(5);
    expect(page2.items.map((c) => c.title)).toEqual(["Card 2", "Card 1"]);

    const page3 = await listCharacters({ page: 3, limit: 2, dbPath, dataDir });
    expect(page3.items.map((c) => c.title)).toEqual(["Card 0"]);
  });

  test("q filters title and slug case-insensitively", async () => {
    plantCard({
      title: "Alpha Hero",
      slug: "alpha-hero",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    plantCard({
      title: "Beta Side",
      slug: "zeta-slug",
      createdAt: "2024-01-02T00:00:00.000Z",
    });
    plantCard({
      title: "Other",
      slug: "alpha-copy",
      createdAt: "2024-01-03T00:00:00.000Z",
    });

    const byTitle = await listCharacters({
      page: 1,
      limit: 10,
      q: "hero",
      dbPath,
      dataDir,
    });
    expect(byTitle.total).toBe(1);
    expect(byTitle.items[0]!.title).toBe("Alpha Hero");

    const bySlug = await listCharacters({
      page: 1,
      limit: 10,
      q: "ALPHA",
      dbPath,
      dataDir,
    });
    expect(bySlug.total).toBe(2);
    expect(bySlug.items.map((c) => c.slug).sort()).toEqual([
      "alpha-copy",
      "alpha-hero",
    ]);
  });

  test("sort title and top", async () => {
    const a = plantCard({
      title: "Charlie",
      slug: "c",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    const b = plantCard({
      title: "Alpha",
      slug: "a",
      createdAt: "2024-01-02T00:00:00.000Z",
    });
    plantCard({
      title: "Bravo",
      slug: "b",
      createdAt: "2024-01-03T00:00:00.000Z",
    });

    const byTitle = await listCharacters({
      page: 1,
      limit: 10,
      sort: "title",
      dbPath,
      dataDir,
    });
    expect(byTitle.items.map((c) => c.title)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);

    setCardVote({ cardId: a, userId: voterId, vote: "like", dbPath });
    setCardVote({
      cardId: b,
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
        cardId: a,
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
    expect(byTop.items[0]!.title).toBe("Charlie");
    expect(byTop.items[0]!.likes).toBe(2);
    expect(byTop.items.at(-1)!.title).toBe("Alpha");
  });

  test("unbounded authorId returns all without page defaults", async () => {
    for (let i = 0; i < 3; i++) {
      plantCard({
        title: `U${i}`,
        slug: `u-${i}`,
        createdAt: new Date(2024, 0, i + 1).toISOString(),
      });
    }
    const result = await listCharacters({
      authorId,
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
