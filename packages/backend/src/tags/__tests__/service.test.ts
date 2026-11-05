import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import {
  characterCards,
  contentTags,
  games,
  tagAliases,
  tagVotes,
  tags,
  users,
} from "../../db/schema";
import {
  DuplicateTagError,
  ForbiddenTagError,
  InvalidTagError,
  TagNotFoundError,
} from "../errors";
import {
  addAlias,
  contentIdsHavingAllTags,
  createTag,
  deleteTag,
  ensureGeneralTag,
  getContentTags,
  getTag,
  listTags,
  setContentTags,
  setTagCategory,
  setTagVote,
  suggestTags,
  tagsByContentIds,
  updateTag,
  type TagActor,
} from "../service";

describe("tag service", () => {
  let tempDir: string;
  let dbPath: string;
  let uploader: TagActor;
  let other: TagActor;
  let admin: TagActor;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-tags-"));
    dbPath = join(tempDir, "test.db");
    migrateDb(dbPath);
    uploader = insertUser("uploader");
    other = insertUser("other");
    admin = { ...insertUser("admin"), isAdmin: true };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function insertUser(username: string): TagActor {
    const userId = crypto.randomUUID();
    getDb(dbPath)
      .insert(users)
      .values({
        id: userId,
        discordId: `discord-${username}-${userId}`,
        username,
        avatar: null,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { userId, isAdmin: false };
  }

  function seedCard(uploaderId: string): string {
    const db = getDb(dbPath);
    const now = new Date().toISOString();
    const gameId = crypto.randomUUID();
    db.insert(games)
      .values({
        id: gameId,
        slug: `game-${gameId}`,
        title: "Test game",
        description: null,
        createdByUserId: uploaderId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const cardId = crypto.randomUUID();
    db.insert(characterCards)
      .values({
        id: cardId,
        gameId,
        uploaderId,
        description: "",
        latestSemver: null,
        latestVersionId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return cardId;
  }

  test("suggestTags matches an alias prefix and returns the canonical tag", () => {
    const tag = createTag({
      name: "Hatsune Miku",
      category: "character",
      actor: admin,
      dbPath,
    });
    addAlias({ tagId: tag.id, alias: "miku", actor: admin, dbPath });

    const hits = suggestTags({ q: "mik", dbPath });

    expect(hits.map((hit) => hit.name)).toEqual(["hatsune_miku"]);
    expect(hits[0]?.id).toBe(tag.id);
    expect(hits[0]?.category).toBe("character");
  });

  test("suggestTags omits excluded canonical names", () => {
    createTag({
      name: "hatsune_miku",
      category: "character",
      actor: admin,
      dbPath,
    });
    const kept = createTag({
      name: "mikoto",
      category: "character",
      actor: admin,
      dbPath,
    });

    const hits = suggestTags({
      q: "mik",
      excludeNames: ["Hatsune Miku"],
      dbPath,
    });

    expect(hits.map((hit) => hit.id)).toEqual([kept.id]);
  });

  test("non-admin can create an author tag", () => {
    const tag = createTag({
      name: "Illustrator",
      category: "author",
      actor: uploader,
      dbPath,
    });

    expect(tag.name).toBe("illustrator");
    expect(tag.category).toBe("author");
  });

  test("non-admin can add an alias", () => {
    const tag = createTag({
      name: "hatsune_miku",
      category: "character",
      actor: uploader,
      dbPath,
    });
    const alias = addAlias({
      tagId: tag.id,
      alias: "miku",
      actor: other,
      dbPath,
    });
    expect(alias.alias).toBe("miku");
    expect(alias.tagId).toBe(tag.id);
  });

  test("ensureGeneralTag creates a missing general tag and returns the existing one", () => {
    const created = ensureGeneralTag("Blue Hair", uploader, dbPath);
    const again = ensureGeneralTag("blue_hair", other, dbPath);

    expect(created.name).toBe("blue_hair");
    expect(created.category).toBe("general");
    expect(again.id).toBe(created.id);
  });

  test("setContentTags rejects unknown names and leaves prior tags", () => {
    createTag({
      name: "illustrator",
      category: "author",
      actor: uploader,
      dbPath,
    });
    setContentTags({
      kind: "cards",
      contentId: "card-1",
      names: ["illustrator"],
      actor: uploader,
      uploaderId: uploader.userId,
      dbPath,
    });

    expect(() =>
      setContentTags({
        kind: "cards",
        contentId: "card-1",
        names: ["illustrator", "does_not_exist"],
        actor: uploader,
        uploaderId: uploader.userId,
        dbPath,
      }),
    ).toThrow(InvalidTagError);

    expect(
      getContentTags({ kind: "cards", contentId: "card-1", dbPath }).map(
        (tag) => tag.name,
      ),
    ).toEqual(["illustrator"]);
    expect(getDb(dbPath).select().from(tags).all().map((row) => row.name)).toEqual([
      "illustrator",
    ]);
  });

  test("updateTag rename collision throws DuplicateTagError", () => {
    createTag({ name: "alpha", category: "general", actor: uploader, dbPath });
    const beta = createTag({
      name: "beta",
      category: "general",
      actor: uploader,
      dbPath,
    });

    expect(() =>
      updateTag({
        tagId: beta.id,
        name: "alpha",
        actor: uploader,
        dbPath,
      }),
    ).toThrow(DuplicateTagError);
  });

  test("tagsByContentIds returns tags grouped by content id", () => {
    const uniform = createTag({
      name: "school_uniform",
      category: "general",
      actor: uploader,
      dbPath,
    });
    const miku = createTag({
      name: "hatsune_miku",
      category: "character",
      actor: uploader,
      dbPath,
    });
    setContentTags({
      kind: "cards",
      contentId: "card-a",
      names: [uniform.name, miku.name],
      actor: uploader,
      uploaderId: uploader.userId,
      dbPath,
    });
    setContentTags({
      kind: "cards",
      contentId: "card-b",
      names: [miku.name],
      actor: uploader,
      uploaderId: uploader.userId,
      dbPath,
    });

    const map = tagsByContentIds({
      kind: "cards",
      contentIds: ["card-a", "card-b", "card-empty"],
      dbPath,
    });
    expect(map.get("card-a")?.map((t) => t.name).sort()).toEqual([
      "hatsune_miku",
      "school_uniform",
    ]);
    expect(map.get("card-b")).toEqual([
      { name: "hatsune_miku", category: "character" },
    ]);
    expect(map.get("card-empty")).toEqual([]);
  });

  test("setContentTags resolves aliases and replaces the previous set", () => {
    const tag = createTag({
      name: "hatsune_miku",
      category: "character",
      actor: admin,
      dbPath,
    });
    addAlias({ tagId: tag.id, alias: "miku", actor: admin, dbPath });
    createTag({
      name: "school_uniform",
      category: "general",
      actor: uploader,
      dbPath,
    });

    setContentTags({
      kind: "cards",
      contentId: "card-1",
      names: ["school_uniform", "miku"],
      actor: uploader,
      uploaderId: uploader.userId,
      dbPath,
    });
    const replaced = setContentTags({
      kind: "cards",
      contentId: "card-1",
      names: ["miku"],
      actor: admin,
      uploaderId: uploader.userId,
      dbPath,
    });

    expect(replaced.map((item) => item.name)).toEqual(["hatsune_miku"]);
    expect(getContentTags({ kind: "cards", contentId: "card-1", dbPath })).toEqual(
      replaced,
    );
    const rows = getDb(dbPath).select().from(tags).all();
    expect(rows.map((row) => row.name).sort()).toEqual([
      "hatsune_miku",
      "school_uniform",
    ]);
  });

  test("setContentTags rejects a user who is not the uploader", () => {
    expect(() =>
      setContentTags({
        kind: "cards",
        contentId: "card-1",
        names: ["school_uniform"],
        actor: other,
        uploaderId: uploader.userId,
        dbPath,
      }),
    ).toThrow(ForbiddenTagError);
    expect(
      getContentTags({ kind: "cards", contentId: "card-1", dbPath }),
    ).toEqual([]);
  });

  test("contentIdsHavingAllTags returns ids that have every tag", () => {
    const uniform = ensureGeneralTag("school_uniform", uploader, dbPath);
    const miku = createTag({
      name: "hatsune_miku",
      category: "character",
      actor: admin,
      dbPath,
    });
    setContentTags({
      kind: "cards",
      contentId: "card-both",
      names: [uniform.name, miku.name],
      actor: uploader,
      uploaderId: uploader.userId,
      dbPath,
    });
    setContentTags({
      kind: "cards",
      contentId: "card-one",
      names: [uniform.name],
      actor: uploader,
      uploaderId: uploader.userId,
      dbPath,
    });
    setContentTags({
      kind: "scenes",
      contentId: "card-both",
      names: [uniform.name, miku.name],
      actor: uploader,
      uploaderId: uploader.userId,
      dbPath,
    });

    expect(
      contentIdsHavingAllTags({
        kind: "cards",
        tagIds: [uniform.id, miku.id],
        dbPath,
      }).sort(),
    ).toEqual(["card-both"]);
    expect(
      contentIdsHavingAllTags({
        kind: "cards",
        tagIds: [uniform.id],
        dbPath,
      }).sort(),
    ).toEqual(["card-both", "card-one"]);
  });

  test("contentIdsHavingAllTags with no tag ids returns every content id of that kind", () => {
    const tagged = seedCard(uploader.userId);
    const untagged = seedCard(uploader.userId);
    const uniform = ensureGeneralTag("school_uniform", uploader, dbPath);
    setContentTags({
      kind: "cards",
      contentId: tagged,
      names: [uniform.name],
      actor: uploader,
      uploaderId: uploader.userId,
      dbPath,
    });

    expect(
      contentIdsHavingAllTags({ kind: "cards", tagIds: [], dbPath }).sort(),
    ).toEqual([tagged, untagged].sort());
  });

  test("setTagVote updates the score and deleteTag cascades aliases, votes, and attachments", () => {
    const tag = createTag({
      name: "cute",
      category: "general",
      actor: uploader,
      dbPath,
    });
    addAlias({ tagId: tag.id, alias: "kawaii", actor: admin, dbPath });
    const liked = setTagVote({
      tagId: tag.id,
      userId: other.userId,
      vote: "like",
      dbPath,
    });
    expect(liked).toEqual({ likes: 1, dislikes: 0, myVote: "like" });

    const disliked = setTagVote({
      tagId: tag.id,
      userId: other.userId,
      vote: "dislike",
      dbPath,
    });
    expect(disliked).toEqual({ likes: 0, dislikes: 1, myVote: "dislike" });

    setContentTags({
      kind: "cards",
      contentId: "card-1",
      names: ["kawaii"],
      actor: uploader,
      uploaderId: uploader.userId,
      dbPath,
    });

    const viewed = getTag(tag.name, {
      viewerUserId: other.userId,
      dbPath,
    });
    expect(viewed.id).toBe(tag.id);
    expect(viewed.dislikes).toBe(1);
    expect(viewed.myVote).toBe("dislike");
    expect(viewed.usageCount).toBe(1);

    deleteTag({ tagId: tag.id, actor: admin, dbPath });

    expect(() => getTag(tag.id, { dbPath })).toThrow(TagNotFoundError);
    const db = getDb(dbPath);
    expect(db.select().from(tagAliases).all()).toEqual([]);
    expect(db.select().from(tagVotes).all()).toEqual([]);
    expect(db.select().from(contentTags).all()).toEqual([]);
    expect(db.select().from(tags).where(eq(tags.id, tag.id)).all()).toEqual(
      [],
    );
  });

  test("non-admin cannot delete a tag but can change its category", () => {
    const tag = createTag({
      name: "cute",
      category: "general",
      actor: uploader,
      dbPath,
    });

    expect(() =>
      deleteTag({ tagId: tag.id, actor: uploader, dbPath }),
    ).toThrow(ForbiddenTagError);

    const updated = setTagCategory({
      tagId: tag.id,
      category: "character",
      actor: other,
      dbPath,
    });
    expect(updated.category).toBe("character");
    expect(getTag(tag.id, { dbPath }).category).toBe("character");
  });

  test("listTags searches aliases and sorts by name, top, and recent", () => {
    const older = createTag({
      name: "alpha",
      category: "general",
      actor: uploader,
      dbPath,
    });
    const newer = createTag({
      name: "hatsune_miku",
      category: "character",
      actor: admin,
      dbPath,
    });
    addAlias({ tagId: newer.id, alias: "vocaloid", actor: admin, dbPath });
    setTagVote({
      tagId: newer.id,
      userId: uploader.userId,
      vote: "like",
      dbPath,
    });
    setTagVote({
      tagId: newer.id,
      userId: other.userId,
      vote: "like",
      dbPath,
    });
    const db = getDb(dbPath);
    db.update(tags)
      .set({ createdAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(tags.id, older.id))
      .run();
    db.update(tags)
      .set({ createdAt: "2024-01-01T00:00:00.000Z" })
      .where(eq(tags.id, newer.id))
      .run();

    expect(
      listTags({ page: 1, limit: 10, q: "vocal", dbPath }).items.map(
        (item) => item.name,
      ),
    ).toEqual(["hatsune_miku"]);
    expect(
      listTags({ page: 1, limit: 10, sort: "name", dbPath }).items.map(
        (item) => item.name,
      ),
    ).toEqual(["alpha", "hatsune_miku"]);
    expect(
      listTags({ page: 1, limit: 10, sort: "top", dbPath }).items.map(
        (item) => item.name,
      ),
    ).toEqual(["hatsune_miku", "alpha"]);
    expect(
      listTags({ page: 1, limit: 10, sort: "recent", dbPath }).items.map(
        (item) => item.name,
      ),
    ).toEqual(["hatsune_miku", "alpha"]);
    expect(listTags({ page: 1, limit: 1, sort: "name", dbPath }).total).toBe(
      2,
    );
  });
});
