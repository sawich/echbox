import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDb } from "../client";
import { migrateDb } from "../migrate";
import {
  characterCardVersions,
  characterCards,
  games,
  pluginVersions,
  plugins,
  sceneVersions,
  scenes,
  softmodVersions,
  softmods,
  users,
} from "../schema";

function insertUserAndGame(db: ReturnType<typeof getDb>, discordId: string) {
  const userId = crypto.randomUUID();
  const gameId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.insert(users).values({
    id: userId,
    discordId,
    username: "tester",
    avatar: null,
    createdAt: now,
  }).run();
  db.insert(games).values({
    id: gameId,
    slug: `game-${gameId.slice(0, 8)}`,
    title: "Test Game",
    description: null,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  }).run();
  return { userId, gameId };
}

describe("schema", () => {
  test("content_hash is globally unique", () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-db-"));
    const dbPath = join(dir, "test.db");
    try {
      const db = getDb(dbPath);
      migrateDb(dbPath);

      const { userId, gameId } = insertUserAndGame(db, "discord-1");
      const cardId = crypto.randomUUID();
      const hash = "a".repeat(64);

      db.insert(characterCards).values({
        id: cardId,
        gameId,
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

  test("softmod version content_hash is globally unique", () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-db-softmod-"));
    const dbPath = join(dir, "test.db");
    try {
      const db = getDb(dbPath);
      migrateDb(dbPath);

      const { userId, gameId } = insertUserAndGame(db, "discord-softmod");
      const softmodId = crypto.randomUUID();
      const hash = "b".repeat(64);

      db.insert(softmods).values({
        id: softmodId,
        gameId,
        authorId: userId,
        title: "Test Softmod",
        modAuthor: "Mod Author",
        description: "Desc",
        website: null,
        latestVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      db.insert(softmodVersions).values({
        id: crypto.randomUUID(),
        softmodId,
        version: 1,
        packageVersion: "1.0.0",
        notes: null,
        contentHash: hash,
        originalPath: "/tmp/original.zipmod",
        summaryJson: "{}",
        createdAt: new Date().toISOString(),
      }).run();

      expect(() =>
        db.insert(softmodVersions).values({
          id: crypto.randomUUID(),
          softmodId,
          version: 2,
          packageVersion: "2.0.0",
          notes: null,
          contentHash: hash,
          originalPath: "/tmp/original2.zipmod",
          summaryJson: "{}",
          createdAt: new Date().toISOString(),
        }).run(),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("scene version content_hash is globally unique", () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-db-scene-"));
    const dbPath = join(dir, "test.db");
    try {
      const db = getDb(dbPath);
      migrateDb(dbPath);

      const { userId, gameId } = insertUserAndGame(db, "discord-scene");
      const sceneId = crypto.randomUUID();
      const hash = "d".repeat(64);

      db.insert(scenes).values({
        id: sceneId,
        gameId,
        authorId: userId,
        slug: "test-scene",
        title: "Test Scene",
        latestVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      db.insert(sceneVersions).values({
        id: crypto.randomUUID(),
        sceneId,
        version: 1,
        notes: null,
        contentHash: hash,
        originalPath: "/tmp/original.png",
        previewPath: "/tmp/preview.webp",
        summaryJson: "{}",
        createdAt: new Date().toISOString(),
      }).run();

      expect(() =>
        db.insert(sceneVersions).values({
          id: crypto.randomUUID(),
          sceneId,
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

  test("plugin version content_hash is globally unique", () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-db-plugin-"));
    const dbPath = join(dir, "test.db");
    try {
      const db = getDb(dbPath);
      migrateDb(dbPath);

      const { userId, gameId } = insertUserAndGame(db, "discord-plugin");
      const pluginId = crypto.randomUUID();
      const hash = "c".repeat(64);

      db.insert(plugins).values({
        id: pluginId,
        gameId,
        authorId: userId,
        title: "Test Plugin",
        description: "Desc",
        latestVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      db.insert(pluginVersions).values({
        id: crypto.randomUUID(),
        pluginId,
        version: 1,
        notes: null,
        contentHash: hash,
        originalPath: "/tmp/original.zip",
        summaryJson: "{}",
        createdAt: new Date().toISOString(),
      }).run();

      expect(() =>
        db.insert(pluginVersions).values({
          id: crypto.randomUUID(),
          pluginId,
          version: 2,
          notes: null,
          contentHash: hash,
          originalPath: "/tmp/original2.zip",
          summaryJson: "{}",
          createdAt: new Date().toISOString(),
        }).run(),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("getDb caches Drizzle instance per resolved dbPath and enables WAL", () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-db-cache-"));
    const dbPath1 = join(dir, "one.db");
    const dbPath2 = join(dir, "two.db");
    try {
      const db1a = getDb(dbPath1);
      const db1b = getDb(dbPath1);
      const db2 = getDb(dbPath2);

      expect(db1a).toBe(db1b);
      expect(db1a).not.toBe(db2);

      const modeRow = (db1a as unknown as { $client: { query: (sql: string) => { get: () => { journal_mode: string } } } })
        .$client.query("PRAGMA journal_mode;").get();
      expect(modeRow.journal_mode.toLowerCase()).toBe("wal");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
