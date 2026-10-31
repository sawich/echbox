import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDb } from "../client";
import { migrateDb } from "../migrate";
import {
  characterCardVersions,
  characterCards,
  users,
} from "../schema";

describe("schema", () => {
  test("content_hash is globally unique", () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-db-"));
    const dbPath = join(dir, "test.db");
    try {
      const db = getDb(dbPath);
      migrateDb(dbPath);

      const userId = crypto.randomUUID();
      const cardId = crypto.randomUUID();
      const hash = "a".repeat(64);

      db.insert(users).values({
        id: userId,
        discordId: "discord-1",
        username: "tester",
        avatar: null,
        createdAt: new Date().toISOString(),
      }).run();

      db.insert(characterCards).values({
        id: cardId,
        authorId: userId,
        slug: "test-card",
        title: "Test",
        latestVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      db.insert(characterCardVersions).values({
        id: crypto.randomUUID(),
        cardId,
        version: 1,
        notes: null,
        contentHash: hash,
        originalPath: "/tmp/original.png",
        previewPath: "/tmp/preview.webp",
        summaryJson: "{}",
        createdAt: new Date().toISOString(),
      }).run();

      expect(() =>
        db.insert(characterCardVersions).values({
          id: crypto.randomUUID(),
          cardId,
          version: 2,
          notes: null,
          contentHash: hash,
          originalPath: "/tmp/original2.png",
          previewPath: "/tmp/preview2.webp",
          summaryJson: "{}",
          createdAt: new Date().toISOString(),
        }).run(),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
