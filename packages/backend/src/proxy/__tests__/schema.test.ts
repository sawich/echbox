import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import {
  characterCardVersions,
  characterCards,
  contentBlobChunks,
  contentBlobs,
  games,
  users,
} from "../../db/schema";

describe("content blob schema", () => {
  test("version delete does not cascade to blob rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-proxy-schema-"));
    const dbPath = join(dir, "test.db");
    try {
      migrateDb(dbPath);
      const db = getDb(dbPath);

      const userId = crypto.randomUUID();
      const gameId = crypto.randomUUID();
      const cardId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const now = new Date().toISOString();
      const contentHash = "e".repeat(64);

      db.insert(users)
        .values({
          id: userId,
          discordId: "discord-blob-schema",
          username: "tester",
          avatar: null,
          createdAt: now,
        })
        .run();

      db.insert(games)
        .values({
          id: gameId,
          slug: `game-${gameId.slice(0, 8)}`,
          title: "Test Game",
          description: null,
          createdByUserId: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(contentBlobs)
        .values({
          contentHash,
          originalByteSize: 100,
          archiveByteSize: 80,
          chunkCount: 2,
          createdAt: now,
        })
        .run();

      db.insert(contentBlobChunks)
        .values([
          {
            contentHash,
            chunkIndex: 0,
            byteSize: 40,
            telegramFileId: "file-a",
            telegramMessageId: "msg-a",
            telegramChatId: "-1001",
          },
          {
            contentHash,
            chunkIndex: 1,
            byteSize: 40,
            telegramFileId: "file-b",
            telegramMessageId: "msg-b",
            telegramChatId: "-1001",
          },
        ])
        .run();

      db.insert(characterCards)
        .values({
          id: cardId,
          gameId,
          authorId: userId,
          slug: "blob-card",
          title: "Blob Card",
          latestSemver: "1.0.0",
          latestVersionId: versionId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(characterCardVersions)
        .values({
          id: versionId,
          cardId,
          semver: "1.0.0",
          notes: null,
          contentHash,
          originalPath: null,
          previewPath: "/tmp/preview.webp",
          summaryJson: "{}",
          createdAt: now,
        })
        .run();

      db.delete(characterCardVersions)
        .where(eq(characterCardVersions.id, versionId))
        .run();

      const blob = db
        .select()
        .from(contentBlobs)
        .where(eq(contentBlobs.contentHash, contentHash))
        .get();
      expect(blob).toBeDefined();

      const chunks = db
        .select()
        .from(contentBlobChunks)
        .where(eq(contentBlobChunks.contentHash, contentHash))
        .all();
      expect(chunks).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
