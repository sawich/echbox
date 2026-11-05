import { describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { newId } from "../../id";
import { getDb } from "../client";
import { migrateDb } from "../migrate";
import {
  characterCardVersions,
  characterCards,
  contentTags,
  games,
  pluginVersions,
  plugins,
  sceneVersions,
  scenes,
  softmodPreviews,
  softmodVersions,
  softmods,
  tagAliases,
  tagVotes,
  tags,
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

type SqliteClient = {
  query: (sql: string) => {
    all: (...params: unknown[]) => Record<string, unknown>[];
    get: (...params: unknown[]) => Record<string, unknown> | null;
    run: (...params: unknown[]) => void;
  };
};

type ColumnInfo = { name: string; notnull: number; dflt_value: string | null };

function sqliteOf(db: ReturnType<typeof getDb>): SqliteClient {
  return (db as unknown as { $client: SqliteClient }).$client;
}

function columnsOf(sqlite: SqliteClient, table: string): ColumnInfo[] {
  return sqlite.query(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

function columnNames(sqlite: SqliteClient, table: string): string[] {
  return columnsOf(sqlite, table).map((column) => column.name);
}

/** Apply every journal entry before `0014_content_tags`, then let `migrateDb` run the rest. */
function migrateBeforeContentTags(db: ReturnType<typeof getDb>, scratchDir: string) {
  const source = join(import.meta.dir, "../../../drizzle");
  const folder = join(scratchDir, "migrations-before-0014");
  mkdirSync(join(folder, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(join(source, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  journal.entries = journal.entries.filter((entry) => entry.idx < 14);
  writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries) {
    cpSync(join(source, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  }
  migrate(db, { migrationsFolder: folder });
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
      const v1Id = crypto.randomUUID();
      const hash = "a".repeat(64);

      db.insert(characterCards).values({
        id: cardId,
        gameId,
        uploaderId: userId,
        description: "",
        latestSemver: "1.0.0",
        latestVersionId: v1Id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      db.insert(characterCardVersions).values({
        id: v1Id,
        cardId,
        semver: "1.0.0",
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
          semver: "2.0.0",
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
      const softmodV1Id = newId();
      const hash = "b".repeat(64);

      db.insert(softmods).values({
        id: softmodId,
        gameId,
        uploaderId: userId,
        description: "Desc",
        website: null,
        latestSemver: "1.0.0",
        latestVersionId: softmodV1Id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      db.insert(softmodVersions).values({
        id: softmodV1Id,
        softmodId,
        semver: "1.0.0",
        notes: null,
        contentHash: hash,
        originalPath: "/tmp/original.zipmod",
        summaryJson: "{}",
        createdAt: new Date().toISOString(),
      }).run();

      expect(() =>
        db.insert(softmodVersions).values({
          id: newId(),
          softmodId,
          semver: "2.0.0",
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
      const v1Id = crypto.randomUUID();
      const hash = "d".repeat(64);

      db.insert(scenes).values({
        id: sceneId,
        gameId,
        uploaderId: userId,
        description: "",
        latestSemver: "1.0.0",
        latestVersionId: v1Id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      db.insert(sceneVersions).values({
        id: v1Id,
        sceneId,
        semver: "1.0.0",
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
          semver: "2.0.0",
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
      const pluginV1Id = newId();
      const hash = "c".repeat(64);

      db.insert(plugins).values({
        id: pluginId,
        gameId,
        uploaderId: userId,
        title: "Test Plugin",
        description: "Desc",
        latestSemver: "1.0.0",
        latestVersionId: pluginV1Id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      db.insert(pluginVersions).values({
        id: pluginV1Id,
        pluginId,
        semver: "1.0.0",
        notes: null,
        contentHash: hash,
        originalPath: "/tmp/original.zip",
        summaryJson: "{}",
        createdAt: new Date().toISOString(),
      }).run();

      expect(() =>
        db.insert(pluginVersions).values({
          id: newId(),
          pluginId,
          semver: "2.0.0",
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

  test("migrates existing content rows onto uploader_id without titles", () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-db-tags-migrate-"));
    const dbPath = join(dir, "test.db");
    try {
      const db = getDb(dbPath);
      migrateBeforeContentTags(db, dir);
      const sqlite = sqliteOf(db);
      const { userId, gameId } = insertUserAndGame(db, "discord-tags-migrate");
      const now = "2026-11-05T00:00:00.000Z";
      const cardId = crypto.randomUUID();
      const sceneId = crypto.randomUUID();
      const clothesId = crypto.randomUUID();
      const softmodId = crypto.randomUUID();
      const pluginId = crypto.randomUUID();
      const cardVersionId = crypto.randomUUID();
      const cardVoteId = crypto.randomUUID();
      const cardHash = "e".repeat(64);

      sqlite.query(
        `INSERT INTO character_cards (id, game_id, author_id, slug, title, latest_semver, latest_version_id, created_at, updated_at)
         VALUES (?, ?, ?, 'old-slug', 'Old Title', '1.2.3', ?, ?, ?)`,
      ).run(cardId, gameId, userId, cardVersionId, now, now);
      sqlite.query(
        `INSERT INTO character_card_versions (id, card_id, semver, notes, content_hash, original_path, preview_path, summary_json, created_at)
         VALUES (?, ?, '1.2.3', NULL, ?, NULL, '/tmp/preview.webp', '{}', ?)`,
      ).run(cardVersionId, cardId, cardHash, now);
      sqlite.query(
        `INSERT INTO card_votes (id, card_id, user_id, vote, created_at, updated_at)
         VALUES (?, ?, ?, 'like', ?, ?)`,
      ).run(cardVoteId, cardId, userId, now, now);
      sqlite.query(
        `INSERT INTO scenes (id, game_id, author_id, slug, title, latest_semver, latest_version_id, created_at, updated_at)
         VALUES (?, ?, ?, 'scene-slug', 'Scene Title', NULL, NULL, ?, ?)`,
      ).run(sceneId, gameId, userId, now, now);
      sqlite.query(
        `INSERT INTO clothes (id, game_id, author_id, slug, title, latest_semver, latest_version_id, created_at, updated_at)
         VALUES (?, ?, ?, 'clothes-slug', 'Clothes Title', NULL, NULL, ?, ?)`,
      ).run(clothesId, gameId, userId, now, now);
      sqlite.query(
        `INSERT INTO softmods (id, game_id, author_id, title, mod_author, description, website, latest_semver, latest_version_id, created_at, updated_at)
         VALUES (?, ?, ?, 'Soft Title', 'Mod Person', 'Keep me', NULL, NULL, NULL, ?, ?)`,
      ).run(softmodId, gameId, userId, now, now);
      sqlite.query(
        `INSERT INTO softmod_versions (id, softmod_id, semver, notes, content_hash, original_path, summary_json, created_at)
         VALUES (?, ?, '1.0.0', NULL, ?, NULL, '{}', ?)`,
      ).run(crypto.randomUUID(), softmodId, "f".repeat(64), now);
      sqlite.query(
        `INSERT INTO plugins (id, game_id, author_id, title, description, latest_semver, latest_version_id, created_at, updated_at)
         VALUES (?, ?, ?, 'Plugin Title', 'Plugin desc', NULL, NULL, ?, ?)`,
      ).run(pluginId, gameId, userId, now, now);

      migrateDb(dbPath);

      for (const table of ["character_cards", "scenes", "clothes"] as const) {
        const columns = columnsOf(sqlite, table);
        const names = columns.map((column) => column.name);
        expect(names).toContain("uploader_id");
        expect(names).toContain("description");
        expect(names).not.toContain("author_id");
        expect(names).not.toContain("title");
        expect(names).not.toContain("slug");
        const description = columns.find((column) => column.name === "description");
        expect(description?.notnull).toBe(1);
        expect(description?.dflt_value).toBe("''");
      }

      const card = sqlite.query(
        `SELECT uploader_id, description, latest_semver FROM character_cards WHERE id = ?`,
      ).get(cardId) as { uploader_id: string; description: string; latest_semver: string };
      expect(card.uploader_id).toBe(userId);
      expect(card.description).toBe("");
      expect(card.latest_semver).toBe("1.2.3");

      const scene = sqlite.query(`SELECT uploader_id, description FROM scenes WHERE id = ?`).get(sceneId) as {
        uploader_id: string;
        description: string;
      };
      expect(scene.uploader_id).toBe(userId);
      expect(scene.description).toBe("");

      const clothes = sqlite.query(`SELECT uploader_id, description FROM clothes WHERE id = ?`).get(clothesId) as {
        uploader_id: string;
        description: string;
      };
      expect(clothes.uploader_id).toBe(userId);
      expect(clothes.description).toBe("");

      const version = sqlite.query(
        `SELECT content_hash, original_path, preview_path FROM character_card_versions WHERE id = ?`,
      ).get(cardVersionId) as { content_hash: string; original_path: string | null; preview_path: string };
      expect(version.content_hash).toBe(cardHash);
      expect(version.original_path).toBeNull();
      expect(version.preview_path).toBe("/tmp/preview.webp");
      expect(() =>
        sqlite.query(
          `INSERT INTO character_card_versions (id, card_id, semver, notes, content_hash, original_path, preview_path, summary_json, created_at)
           VALUES (?, ?, '9.9.9', NULL, ?, NULL, '/tmp/other.webp', '{}', ?)`,
        ).run(crypto.randomUUID(), cardId, cardHash, now),
      ).toThrow();
      const freshVersionId = crypto.randomUUID();
      sqlite.query(
        `INSERT INTO character_card_versions (id, card_id, semver, notes, content_hash, original_path, preview_path, summary_json, created_at)
         VALUES (?, ?, '9.9.9', NULL, ?, NULL, '/tmp/other.webp', '{}', ?)`,
      ).run(freshVersionId, cardId, "1".repeat(64), now);
      expect(sqlite.query(`SELECT id FROM character_card_versions WHERE id = ?`).get(freshVersionId)).toEqual({
        id: freshVersionId,
      });

      const vote = sqlite.query(`SELECT vote FROM card_votes WHERE id = ?`).get(cardVoteId) as { vote: string };
      expect(vote.vote).toBe("like");

      const softmodColumns = columnNames(sqlite, "softmods");
      expect(softmodColumns).toContain("uploader_id");
      expect(softmodColumns).toContain("description");
      expect(softmodColumns).not.toContain("author_id");
      expect(softmodColumns).not.toContain("title");
      expect(softmodColumns).not.toContain("mod_author");
      const softmodDescription = columnsOf(sqlite, "softmods").find((column) => column.name === "description");
      expect(softmodDescription?.notnull).toBe(1);
      expect(softmodDescription?.dflt_value).toBeNull();
      const softmod = sqlite.query(
        `SELECT uploader_id, description FROM softmods WHERE id = ?`,
      ).get(softmodId) as { uploader_id: string; description: string };
      expect(softmod.uploader_id).toBe(userId);
      expect(softmod.description).toBe("Keep me");
      const softmodVersion = sqlite.query(
        `SELECT original_path FROM softmod_versions WHERE softmod_id = ?`,
      ).get(softmodId) as { original_path: string | null };
      expect(softmodVersion.original_path).toBeNull();

      const pluginColumns = columnNames(sqlite, "plugins");
      expect(pluginColumns).toContain("uploader_id");
      expect(pluginColumns).toContain("title");
      expect(pluginColumns).not.toContain("author_id");
      const plugin = sqlite.query(
        `SELECT uploader_id, title, description FROM plugins WHERE id = ?`,
      ).get(pluginId) as { uploader_id: string; title: string; description: string };
      expect(plugin.uploader_id).toBe(userId);
      expect(plugin.title).toBe("Plugin Title");
      expect(plugin.description).toBe("Plugin desc");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("tag delete cascades aliases, votes, and content tags; softmods store three previews", () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-db-tags-cascade-"));
    const dbPath = join(dir, "test.db");
    try {
      const db = getDb(dbPath);
      migrateDb(dbPath);
      const sqlite = sqliteOf(db);
      const { userId, gameId } = insertUserAndGame(db, "discord-tags-cascade");
      const now = "2026-11-05T00:00:00.000Z";
      const softmodId = crypto.randomUUID();
      const tagId = crypto.randomUUID();
      const aliasId = crypto.randomUUID();
      const voteId = crypto.randomUUID();
      const contentTagId = crypto.randomUUID();

      expect(sqlite.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tags'`).get()).toEqual({
        name: "tags",
      });

      sqlite.query(
        `INSERT INTO softmods (id, game_id, uploader_id, description, website, latest_semver, latest_version_id, created_at, updated_at)
         VALUES (?, ?, ?, '', NULL, NULL, NULL, ?, ?)`,
      ).run(softmodId, gameId, userId, now, now);
      sqlite.query(
        `INSERT INTO tags (id, name, category, created_by_user_id, created_at, updated_at)
         VALUES (?, 'hatsune_miku', 'character', ?, ?, ?)`,
      ).run(tagId, userId, now, now);
      sqlite.query(
        `INSERT INTO tag_aliases (id, alias, tag_id, created_at) VALUES (?, 'miku', ?, ?)`,
      ).run(aliasId, tagId, now);
      sqlite.query(
        `INSERT INTO tag_votes (id, tag_id, user_id, vote, created_at, updated_at)
         VALUES (?, ?, ?, 'like', ?, ?)`,
      ).run(voteId, tagId, userId, now, now);
      sqlite.query(
        `INSERT INTO content_tags (id, tag_id, content_kind, content_id, created_by_user_id, created_at)
         VALUES (?, ?, 'softmods', ?, ?, ?)`,
      ).run(contentTagId, tagId, softmodId, userId, now);

      for (const sortIndex of [0, 1, 2]) {
        sqlite.query(
          `INSERT INTO softmod_previews (id, softmod_id, sort_index, preview_path, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(crypto.randomUUID(), softmodId, sortIndex, `/tmp/preview-${sortIndex}.webp`, now);
      }
      const previewCount = sqlite.query(
        `SELECT COUNT(*) AS n FROM softmod_previews WHERE softmod_id = ?`,
      ).get(softmodId) as { n: number };
      expect(Number(previewCount.n)).toBe(3);
      const [tagRow] = db.select().from(tags).all();
      expect(tagRow?.name).toBe("hatsune_miku");
      expect(tagRow?.category).toBe("character");
      expect(db.select().from(tagAliases).all()).toHaveLength(1);
      expect(db.select().from(tagVotes).all()).toHaveLength(1);
      expect(db.select().from(contentTags).all()[0]?.contentKind).toBe("softmods");
      expect(db.select().from(softmodPreviews).all()).toHaveLength(3);
      expect(() =>
        sqlite.query(
          `INSERT INTO softmod_previews (id, softmod_id, sort_index, preview_path, created_at)
           VALUES (?, ?, 0, '/tmp/dup.webp', ?)`,
        ).run(crypto.randomUUID(), softmodId, now),
      ).toThrow();

      sqlite.query(`DELETE FROM tags WHERE id = ?`).run(tagId);
      const aliasCount = sqlite.query(`SELECT COUNT(*) AS n FROM tag_aliases WHERE tag_id = ?`).get(tagId) as {
        n: number;
      };
      const voteCount = sqlite.query(`SELECT COUNT(*) AS n FROM tag_votes WHERE tag_id = ?`).get(tagId) as {
        n: number;
      };
      const contentCount = sqlite.query(`SELECT COUNT(*) AS n FROM content_tags WHERE tag_id = ?`).get(tagId) as {
        n: number;
      };
      expect(Number(aliasCount.n)).toBe(0);
      expect(Number(voteCount.n)).toBe(0);
      expect(Number(contentCount.n)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
