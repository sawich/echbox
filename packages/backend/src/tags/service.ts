import {
  type TagCategory,
  type TaggableContentKind,
  TagCategorySchema,
  TaggableContentKindSchema,
} from "@echbox/shared";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { escapeLikePattern } from "../common/list-query";
import { getDb } from "../db/client";
import type * as schema from "../db/schema";
import {
  characterCards,
  clothes,
  contentTags,
  scenes,
  softmods,
  tagAliases,
  tagVotes,
  tags,
  type TagVoteValue,
} from "../db/schema";
import { newId } from "../id";
import {
  DuplicateTagError,
  ForbiddenTagError,
  InvalidTagError,
  TagNotFoundError,
} from "./errors";
import { normalizeTagName } from "./normalize";

type TagDb = BunSQLiteDatabase<typeof schema>;

export type TagActor = {
  userId: string;
  isAdmin: boolean;
};

export type TagView = {
  id: string;
  name: string;
  category: TagCategory;
  likes: number;
  dislikes: number;
  myVote: TagVoteValue | null;
  usageCount: number;
};

export type TagVoteCounts = {
  likes: number;
  dislikes: number;
  myVote: TagVoteValue | null;
};

export type TagListSort = "top" | "recent" | "name";

export type TagListResult = {
  items: TagView[];
  total: number;
  page: number;
  limit: number;
};

const DEFAULT_SUGGEST_LIMIT = 10;
const MAX_SUGGEST_LIMIT = 50;
const DEFAULT_PAGE_LIMIT = 24;
const MAX_PAGE_LIMIT = 100;

const usageCountSql = sql<number>`(
  select count(*) from content_tags where content_tags.tag_id = ${tags.id}
)`.mapWith(Number);

const netScoreSql = sql`(
  coalesce(sum(case when ${tagVotes.vote} = 'like' then 1 else 0 end), 0)
  -
  coalesce(sum(case when ${tagVotes.vote} = 'dislike' then 1 else 0 end), 0)
)`;

function canonicalName(raw: string): string {
  try {
    return normalizeTagName(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid tag name";
    throw new InvalidTagError(message);
  }
}

function parseCategory(category: string): TagCategory {
  const parsed = TagCategorySchema.safeParse(category);
  if (!parsed.success) {
    throw new InvalidTagError("Invalid tag category");
  }
  return parsed.data;
}

function parseKind(kind: string): TaggableContentKind {
  const parsed = TaggableContentKindSchema.safeParse(kind);
  if (!parsed.success) {
    throw new InvalidTagError("Invalid content kind");
  }
  return parsed.data;
}

function requireAdmin(actor: TagActor): void {
  if (!actor.isAdmin) {
    throw new ForbiddenTagError("Only an admin can do that.");
  }
}

function isUniqueError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes("UNIQUE constraint failed")
  );
}

function nameOrAliasLike(pattern: string) {
  return sql`(
    ${tags.name} like ${pattern} escape '\\'
    or exists (
      select 1 from tag_aliases
      where tag_aliases.tag_id = ${tags.id}
        and tag_aliases.alias like ${pattern} escape '\\'
    )
  )`;
}

function searchNeedle(q: string | undefined): string | null {
  const trimmed = q?.trim() ?? "";
  if (!trimmed) return null;
  try {
    return normalizeTagName(trimmed);
  } catch {
    return null;
  }
}

function findTagByNameOrAlias(db: TagDb, name: string) {
  const byName = db.select().from(tags).where(eq(tags.name, name)).get();
  if (byName) return byName;

  const alias = db
    .select()
    .from(tagAliases)
    .where(eq(tagAliases.alias, name))
    .get();
  if (!alias) return null;

  return db.select().from(tags).where(eq(tags.id, alias.tagId)).get() ?? null;
}

function insertTag(
  db: TagDb,
  input: { name: string; category: TagCategory; userId: string },
): string {
  const now = new Date().toISOString();
  const id = newId();
  try {
    db.insert(tags)
      .values({
        id,
        name: input.name,
        category: input.category,
        createdByUserId: input.userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  } catch (error) {
    if (isUniqueError(error)) {
      throw new DuplicateTagError();
    }
    throw error;
  }
  return id;
}

function myVoteMap(
  db: TagDb,
  tagIds: string[],
  viewerUserId?: string | null,
): Map<string, TagVoteValue> {
  const votes = new Map<string, TagVoteValue>();
  if (!viewerUserId || tagIds.length === 0) return votes;

  const rows = db
    .select({ tagId: tagVotes.tagId, vote: tagVotes.vote })
    .from(tagVotes)
    .where(
      and(inArray(tagVotes.tagId, tagIds), eq(tagVotes.userId, viewerUserId)),
    )
    .all();

  for (const row of rows) {
    if (row.vote === "like" || row.vote === "dislike") {
      votes.set(row.tagId, row.vote);
    }
  }
  return votes;
}

function selectTagStats(db: TagDb) {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      category: tags.category,
      createdAt: tags.createdAt,
      likes: sql<number>`coalesce(sum(case when ${tagVotes.vote} = 'like' then 1 else 0 end), 0)`.mapWith(
        Number,
      ),
      dislikes: sql<number>`coalesce(sum(case when ${tagVotes.vote} = 'dislike' then 1 else 0 end), 0)`.mapWith(
        Number,
      ),
      usageCount: usageCountSql,
    })
    .from(tags)
    .leftJoin(tagVotes, eq(tagVotes.tagId, tags.id));
}

function toView(
  row: {
    id: string;
    name: string;
    category: string;
    likes: number;
    dislikes: number;
    usageCount: number;
  },
  myVote: TagVoteValue | null,
): TagView {
  return {
    id: row.id,
    name: row.name,
    category: parseCategory(row.category),
    likes: row.likes,
    dislikes: row.dislikes,
    myVote,
    usageCount: row.usageCount,
  };
}

function loadTagViews(
  db: TagDb,
  ids: string[],
  viewerUserId?: string | null,
): TagView[] {
  if (ids.length === 0) return [];

  const rows = selectTagStats(db)
    .where(inArray(tags.id, ids))
    .groupBy(tags.id)
    .all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const votes = myVoteMap(db, ids, viewerUserId);

  return ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [toView(row, votes.get(id) ?? null)];
  });
}

function requireTagView(
  db: TagDb,
  id: string,
  viewerUserId?: string | null,
): TagView {
  const view = loadTagViews(db, [id], viewerUserId)[0];
  if (!view) throw new TagNotFoundError();
  return view;
}

function pageWindow(page: number, limit: number): {
  page: number;
  limit: number;
  offset: number;
} {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  let safeLimit =
    Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : DEFAULT_PAGE_LIMIT;
  if (safeLimit > MAX_PAGE_LIMIT) safeLimit = MAX_PAGE_LIMIT;
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

function allContentIds(db: TagDb, kind: TaggableContentKind): string[] {
  switch (kind) {
    case "cards":
      return db
        .select({ id: characterCards.id })
        .from(characterCards)
        .all()
        .map((row) => row.id);
    case "clothes":
      return db
        .select({ id: clothes.id })
        .from(clothes)
        .all()
        .map((row) => row.id);
    case "scenes":
      return db
        .select({ id: scenes.id })
        .from(scenes)
        .all()
        .map((row) => row.id);
    case "softmods":
      return db
        .select({ id: softmods.id })
        .from(softmods)
        .all()
        .map((row) => row.id);
  }
}

export function suggestTags(input: {
  q: string;
  limit?: number;
  excludeNames?: string[];
  dbPath?: string;
}): TagView[] {
  const needle = searchNeedle(input.q);
  if (!needle) return [];

  let limit = input.limit ?? DEFAULT_SUGGEST_LIMIT;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_SUGGEST_LIMIT;
  limit = Math.min(Math.floor(limit), MAX_SUGGEST_LIMIT);

  const excluded = (input.excludeNames ?? []).map((name) => canonicalName(name));
  const pattern = `${escapeLikePattern(needle)}%`;
  const filters = [nameOrAliasLike(pattern)];
  if (excluded.length > 0) {
    filters.push(notInArray(tags.name, excluded));
  }

  const db = getDb(input.dbPath);
  const rows = selectTagStats(db)
    .where(and(...filters))
    .groupBy(tags.id)
    .orderBy(desc(usageCountSql), desc(netScoreSql), asc(tags.name))
    .limit(limit)
    .all();

  return rows.map((row) => toView(row, null));
}

export function listTags(input: {
  page: number;
  limit: number;
  q?: string;
  sort?: TagListSort;
  viewerUserId?: string | null;
  dbPath?: string;
}): TagListResult {
  const window = pageWindow(input.page, input.limit);
  const sort: TagListSort =
    input.sort === "top" || input.sort === "name" || input.sort === "recent"
      ? input.sort
      : "recent";
  const trimmed = input.q?.trim() ?? "";
  const needle = searchNeedle(input.q);
  if (trimmed && !needle) {
    return { items: [], total: 0, page: window.page, limit: window.limit };
  }

  const filters = [];
  if (needle) {
    filters.push(nameOrAliasLike(`%${escapeLikePattern(needle)}%`));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const db = getDb(input.dbPath);
  const total =
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(tags)
      .where(where)
      .get()?.total ?? 0;

  const orderBy =
    sort === "name"
      ? [asc(tags.name)]
      : sort === "top"
        ? [desc(netScoreSql), asc(tags.name)]
        : [desc(tags.createdAt), asc(tags.name)];

  const rows = selectTagStats(db)
    .where(where)
    .groupBy(tags.id)
    .orderBy(...orderBy)
    .limit(window.limit)
    .offset(window.offset)
    .all();

  const votes = myVoteMap(
    db,
    rows.map((row) => row.id),
    input.viewerUserId,
  );

  return {
    items: rows.map((row) => toView(row, votes.get(row.id) ?? null)),
    total,
    page: window.page,
    limit: window.limit,
  };
}

export function getTag(
  idOrName: string,
  options?: { viewerUserId?: string | null; dbPath?: string },
): TagView {
  const db = getDb(options?.dbPath);
  const key = idOrName.trim();
  const byId = db.select({ id: tags.id }).from(tags).where(eq(tags.id, key)).get();
  if (byId) return requireTagView(db, byId.id, options?.viewerUserId);

  let needle: string | null = null;
  try {
    needle = normalizeTagName(key);
  } catch {
    needle = null;
  }
  if (needle) {
    const found = findTagByNameOrAlias(db, needle);
    if (found) return requireTagView(db, found.id, options?.viewerUserId);
  }

  throw new TagNotFoundError();
}

export function createTag(input: {
  name: string;
  category: TagCategory;
  actor: TagActor;
  dbPath?: string;
}): TagView {
  const category = parseCategory(input.category);
  const name = canonicalName(input.name);
  void input.actor;

  const db = getDb(input.dbPath);
  if (findTagByNameOrAlias(db, name)) {
    throw new DuplicateTagError();
  }

  const id = insertTag(db, {
    name,
    category,
    userId: input.actor.userId,
  });
  return requireTagView(db, id);
}

export function ensureGeneralTag(
  name: string,
  actor: TagActor,
  dbPath?: string,
): TagView {
  const canonical = canonicalName(name);
  const db = getDb(dbPath);
  const existing = findTagByNameOrAlias(db, canonical);
  if (existing) return requireTagView(db, existing.id);

  const id = insertTag(db, {
    name: canonical,
    category: "general",
    userId: actor.userId,
  });
  return requireTagView(db, id);
}

export function addAlias(input: {
  tagId: string;
  alias: string;
  actor: TagActor;
  dbPath?: string;
}): { id: string; alias: string; tagId: string } {
  void input.actor;
  const alias = canonicalName(input.alias);
  const db = getDb(input.dbPath);
  const tag = db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.id, input.tagId))
    .get();
  if (!tag) throw new TagNotFoundError();
  if (alias === tag.name) {
    throw new InvalidTagError("Alias matches the tag name");
  }
  if (findTagByNameOrAlias(db, alias)) {
    throw new DuplicateTagError("That alias is already in use");
  }

  const id = newId();
  const now = new Date().toISOString();
  try {
    db.insert(tagAliases)
      .values({ id, alias, tagId: tag.id, createdAt: now })
      .run();
  } catch (error) {
    if (isUniqueError(error)) {
      throw new DuplicateTagError("That alias is already in use");
    }
    throw error;
  }

  return { id, alias, tagId: tag.id };
}

export function setTagCategory(input: {
  tagId: string;
  category: TagCategory;
  actor: TagActor;
  dbPath?: string;
}): TagView {
  return updateTag({
    tagId: input.tagId,
    category: input.category,
    actor: input.actor,
    dbPath: input.dbPath,
  });
}

export function updateTag(input: {
  tagId: string;
  name?: string;
  category?: TagCategory | string;
  aliases?: string[];
  actor: TagActor;
  dbPath?: string;
}): TagView {
  void input.actor;
  const db = getDb(input.dbPath);
  const tag = db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.id, input.tagId))
    .get();
  if (!tag) throw new TagNotFoundError();

  const nextName =
    input.name !== undefined ? canonicalName(input.name) : tag.name;
  const nextCategory =
    input.category !== undefined
      ? parseCategory(input.category)
      : undefined;

  if (nextName !== tag.name) {
    const clash = findTagByNameOrAlias(db, nextName);
    if (clash && clash.id !== tag.id) {
      throw new DuplicateTagError();
    }
  }

  let normalizedAliases: string[] | undefined;
  if (input.aliases !== undefined) {
    const seen = new Set<string>();
    normalizedAliases = [];
    for (const raw of input.aliases) {
      const alias = canonicalName(raw);
      if (alias === nextName) {
        throw new InvalidTagError("Alias matches the tag name");
      }
      if (seen.has(alias)) continue;
      seen.add(alias);
      const clash = findTagByNameOrAlias(db, alias);
      if (clash && clash.id !== tag.id) {
        throw new DuplicateTagError("That alias is already in use");
      }
      // Alias may already point at this tag — allowed when replacing set
      normalizedAliases.push(alias);
    }
  }

  const now = new Date().toISOString();
  db.transaction((tx) => {
    const patch: { name?: string; category?: TagCategory; updatedAt: string } = {
      updatedAt: now,
    };
    if (nextName !== tag.name) patch.name = nextName;
    if (nextCategory !== undefined) patch.category = nextCategory;
    if (patch.name !== undefined || patch.category !== undefined) {
      tx.update(tags).set(patch).where(eq(tags.id, tag.id)).run();
    }

    if (normalizedAliases !== undefined) {
      tx.delete(tagAliases).where(eq(tagAliases.tagId, tag.id)).run();
      for (const alias of normalizedAliases) {
        tx.insert(tagAliases)
          .values({
            id: newId(),
            alias,
            tagId: tag.id,
            createdAt: now,
          })
          .run();
      }
    }
  });

  return requireTagView(db, tag.id);
}

export function deleteTag(input: {
  tagId: string;
  actor: TagActor;
  dbPath?: string;
}): void {
  requireAdmin(input.actor);
  const db = getDb(input.dbPath);
  const tag = db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.id, input.tagId))
    .get();
  if (!tag) throw new TagNotFoundError();

  db.delete(tags).where(eq(tags.id, tag.id)).run();
}

export function setTagVote(input: {
  tagId: string;
  userId: string;
  vote: TagVoteValue | null;
  dbPath?: string;
}): TagVoteCounts {
  if (input.vote !== null && input.vote !== "like" && input.vote !== "dislike") {
    throw new InvalidTagError("Vote must be like, dislike, or null");
  }

  const db = getDb(input.dbPath);
  const tag = db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.id, input.tagId))
    .get();
  if (!tag) throw new TagNotFoundError();

  const existing = db
    .select()
    .from(tagVotes)
    .where(and(eq(tagVotes.tagId, tag.id), eq(tagVotes.userId, input.userId)))
    .get();
  const now = new Date().toISOString();

  if (input.vote === null) {
    if (existing) {
      db.delete(tagVotes).where(eq(tagVotes.id, existing.id)).run();
    }
  } else if (existing) {
    db.update(tagVotes)
      .set({ vote: input.vote, updatedAt: now })
      .where(eq(tagVotes.id, existing.id))
      .run();
  } else {
    db.insert(tagVotes)
      .values({
        id: newId(),
        tagId: tag.id,
        userId: input.userId,
        vote: input.vote,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  const view = requireTagView(db, tag.id, input.userId);
  return { likes: view.likes, dislikes: view.dislikes, myVote: view.myVote };
}

/**
 * `content_tags.content_id` is polymorphic and has no FK to the parent row.
 * Call this inside the same transaction as the parent delete.
 */
export function deleteContentTagsFor(
  tx: Pick<TagDb, "delete">,
  kind: TaggableContentKind,
  contentIds: readonly string[],
): void {
  if (contentIds.length === 0) return;
  tx.delete(contentTags)
    .where(
      and(
        eq(contentTags.contentKind, kind),
        inArray(contentTags.contentId, [...contentIds]),
      ),
    )
    .run();
}

export function setContentTags(input: {
  kind: TaggableContentKind;
  contentId: string;
  names: string[];
  actor: TagActor;
  uploaderId: string;
  dbPath?: string;
}): TagView[] {
  const kind = parseKind(input.kind);
  if (input.actor.userId !== input.uploaderId && !input.actor.isAdmin) {
    throw new ForbiddenTagError(
      "Only the uploader can change tags on this item.",
    );
  }

  const canonicalNames: string[] = [];
  const seenNames = new Set<string>();
  for (const raw of input.names) {
    const name = canonicalName(raw);
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    canonicalNames.push(name);
  }

  const db = getDb(input.dbPath);
  const tagIds: string[] = [];
  const seenIds = new Set<string>();
  for (const name of canonicalNames) {
    const existing = findTagByNameOrAlias(db, name);
    if (!existing) {
      throw new InvalidTagError(`Unknown tag: ${name}`);
    }
    if (seenIds.has(existing.id)) continue;
    seenIds.add(existing.id);
    tagIds.push(existing.id);
  }

  db.transaction((tx) => {
    tx.delete(contentTags)
      .where(
        and(
          eq(contentTags.contentKind, kind),
          eq(contentTags.contentId, input.contentId),
        ),
      )
      .run();

    const now = new Date().toISOString();
    for (const tagId of tagIds) {
      tx.insert(contentTags)
        .values({
          id: newId(),
          tagId,
          contentKind: kind,
          contentId: input.contentId,
          createdByUserId: input.actor.userId,
          createdAt: now,
        })
        .run();
    }
  });

  return getContentTags({
    kind,
    contentId: input.contentId,
    dbPath: input.dbPath,
  });
}

export type ContentTagRef = {
  name: string;
  category: TagCategory;
};

export function tagsByContentIds(input: {
  kind: TaggableContentKind;
  contentIds: string[];
  dbPath?: string;
}): Map<string, ContentTagRef[]> {
  const kind = parseKind(input.kind);
  const result = new Map<string, ContentTagRef[]>();
  for (const id of input.contentIds) {
    result.set(id, []);
  }
  if (input.contentIds.length === 0) return result;

  const db = getDb(input.dbPath);
  const rows = db
    .select({
      contentId: contentTags.contentId,
      name: tags.name,
      category: tags.category,
    })
    .from(contentTags)
    .innerJoin(tags, eq(contentTags.tagId, tags.id))
    .where(
      and(
        eq(contentTags.contentKind, kind),
        inArray(contentTags.contentId, input.contentIds),
      ),
    )
    .orderBy(asc(tags.name))
    .all();

  for (const row of rows) {
    const list = result.get(row.contentId) ?? [];
    list.push({
      name: row.name,
      category: row.category as TagCategory,
    });
    result.set(row.contentId, list);
  }
  return result;
}

export function getContentTags(input: {
  kind: TaggableContentKind;
  contentId: string;
  dbPath?: string;
}): TagView[] {
  const kind = parseKind(input.kind);
  const db = getDb(input.dbPath);
  const rows = db
    .select({ tagId: contentTags.tagId, name: tags.name })
    .from(contentTags)
    .innerJoin(tags, eq(tags.id, contentTags.tagId))
    .where(
      and(
        eq(contentTags.contentKind, kind),
        eq(contentTags.contentId, input.contentId),
      ),
    )
    .orderBy(asc(tags.name))
    .all();

  const views = loadTagViews(
    db,
    rows.map((row) => row.tagId),
  );
  return views.sort((a, b) => a.name.localeCompare(b.name));
}

export function contentIdsHavingAllTags(input: {
  kind: TaggableContentKind;
  tagIds: string[];
  dbPath?: string;
}): string[] {
  const kind = parseKind(input.kind);
  const db = getDb(input.dbPath);
  const uniqueIds = [...new Set(input.tagIds)];
  if (uniqueIds.length === 0) {
    return allContentIds(db, kind);
  }

  return db
    .select({ contentId: contentTags.contentId })
    .from(contentTags)
    .where(
      and(
        eq(contentTags.contentKind, kind),
        inArray(contentTags.tagId, uniqueIds),
      ),
    )
    .groupBy(contentTags.contentId)
    .having(sql`count(distinct ${contentTags.tagId}) = ${uniqueIds.length}`)
    .all()
    .map((row) => row.contentId);
}
