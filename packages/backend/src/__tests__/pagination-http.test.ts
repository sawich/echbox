import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../app";
import { getDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import {
  characterCardVersions,
  characterCards,
  users,
} from "../db/schema";
import { seedTestGame } from "./test-game";

describe("list endpoints pagination HTTP", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let gameId: string;

  const origDbPath = process.env.DATABASE_PATH;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-page-http-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    Bun.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;
    Bun.env.DATA_DIR = dataDir;

    migrateDb(dbPath);
    const db = getDb(dbPath);
    authorId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.insert(users)
      .values({
        id: authorId,
        discordId: "discord-page-http",
        username: "page_author",
        avatar: null,
        createdAt: now,
      })
      .run();
    gameId = seedTestGame(authorId, { dbPath }).id;

    for (let i = 0; i < 5; i++) {
      const cardId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const createdAt = new Date(2024, 0, i + 1).toISOString();
      db.insert(characterCards)
        .values({
          id: cardId,
          gameId,
          authorId,
          slug: `http-card-${i}`,
          title: i === 2 ? "Special Needle" : `HTTP Card ${i}`,
          latestSemver: "1.0.0",
          latestVersionId: versionId,
          createdAt,
          updatedAt: createdAt,
        })
        .run();
      db.insert(characterCardVersions)
        .values({
          id: versionId,
          cardId,
          semver: "1.0.0",
          notes: null,
          contentHash: `http-hash-${i}-${cardId}`,
          originalPath: null,
          previewPath: `preview/${versionId}.webp`,
          summaryJson: "{}",
          createdAt,
        })
        .run();
    }
  });

  afterEach(() => {
    if (origDbPath === undefined) {
      delete process.env.DATABASE_PATH;
      delete Bun.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = origDbPath;
      Bun.env.DATABASE_PATH = origDbPath;
    }
    if (origDataDir === undefined) {
      delete process.env.DATA_DIR;
      delete Bun.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = origDataDir;
      Bun.env.DATA_DIR = origDataDir;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("GET /api/kk/cards returns paginated envelope", async () => {
    const res = await app.handle(
      new Request(
        "http://localhost/api/kk/cards?type=character&page=1&limit=2&sort=recent",
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: { title: string }[];
      total: number;
      page: number;
      limit: number;
    };
    expect(body.total).toBe(5);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(2);
    expect(body.cards).toHaveLength(2);
    expect(body.cards[0]!.title).toBe("HTTP Card 4");
  });

  test("GET /api/kk/cards?q= filters and sorts by title", async () => {
    const qRes = await app.handle(
      new Request("http://localhost/api/kk/cards?q=Needle&limit=10"),
    );
    expect(qRes.status).toBe(200);
    const qBody = (await qRes.json()) as {
      cards: { title: string }[];
      total: number;
    };
    expect(qBody.total).toBe(1);
    expect(qBody.cards[0]!.title).toBe("Special Needle");

    const titleRes = await app.handle(
      new Request(
        "http://localhost/api/kk/cards?sort=title&limit=10&page=1",
      ),
    );
    const titleBody = (await titleRes.json()) as {
      cards: { title: string }[];
    };
    expect(titleBody.cards.map((c) => c.title)).toEqual([
      "HTTP Card 0",
      "HTTP Card 1",
      "HTTP Card 3",
      "HTTP Card 4",
      "Special Needle",
    ]);
  });

  test("GET /api/kk/cards?type=scene returns empty paginated envelope", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards?type=scene"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: unknown[];
      total: number;
      page: number;
      limit: number;
    };
    expect(body.cards).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(24);
  });
});
