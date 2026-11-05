import {
  BadContentPathError,
  parseContentKindsInput,
  type ContentKind,
  type GameContentKind,
} from "@echbox/shared";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  characterCards,
  clothes,
  gameContentKinds,
  games,
  scenes,
  softmods,
} from "../db/schema";
import { deleteContentTagsFor } from "../tags/service";
import {
  BadGameError,
  GameConflictError,
  GameNotFoundError,
} from "./errors";
import { gameIconUrls, type GameIconUrls, removeGameIcons } from "./icons";

export {
  BadGameError,
  GameConflictError,
  GameNotFoundError,
  GameServiceError,
} from "./errors";

export type GameServiceOptions = {
  dbPath?: string;
  dataDir?: string;
};

export type GameRecord = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  iconUrls: GameIconUrls;
  contentKinds: GameContentKind[];
};

export type CreateGameInput = GameServiceOptions & {
  title: string;
  slug?: string;
  description?: string | null;
  createdByUserId: string;
  contentKinds?: Array<{ kind: ContentKind; relPath?: string | null }>;
};

export type PatchGameInput = GameServiceOptions & {
  id: string;
  title?: string;
  slug?: string;
  description?: string | null;
  contentKinds?: Array<{ kind: ContentKind; relPath?: string | null }>;
};

function slugify(input: string, fallbackId: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `game-${fallbackId.slice(0, 8)}`;
}

function parseKindsOrThrow(
  raw: Array<{ kind: ContentKind; relPath?: string | null }> | undefined,
): GameContentKind[] {
  try {
    return parseContentKindsInput(raw ?? []);
  } catch (err) {
    const message =
      err instanceof BadContentPathError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Invalid contentKinds";
    throw new BadGameError(message, "bad_content_kinds");
  }
}

function loadContentKinds(
  gameId: string,
  dbPath?: string,
): GameContentKind[] {
  const db = getDb(dbPath);
  return db
    .select()
    .from(gameContentKinds)
    .where(eq(gameContentKinds.gameId, gameId))
    .all()
    .map((row) => ({
      kind: row.kind as ContentKind,
      relPath: row.relPath,
    }));
}

function replaceContentKinds(
  gameId: string,
  kinds: GameContentKind[],
  dbPath?: string,
): void {
  const db = getDb(dbPath);
  db.delete(gameContentKinds).where(eq(gameContentKinds.gameId, gameId)).run();
  for (const kind of kinds) {
    db.insert(gameContentKinds)
      .values({
        gameId,
        kind: kind.kind,
        relPath: kind.relPath,
      })
      .run();
  }
}

function toRecord(row: typeof games.$inferSelect, dbPath?: string): GameRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    iconUrls: gameIconUrls(row.id),
    contentKinds: loadContentKinds(row.id, dbPath),
  };
}

export function listGames(options?: GameServiceOptions): GameRecord[] {
  const db = getDb(options?.dbPath);
  return db
    .select()
    .from(games)
    .orderBy(desc(games.createdAt))
    .all()
    .map((row) => toRecord(row, options?.dbPath));
}

export function getGame(
  id: string,
  options?: GameServiceOptions,
): GameRecord | null {
  const db = getDb(options?.dbPath);
  const row = db.select().from(games).where(eq(games.id, id)).get();
  return row ? toRecord(row, options?.dbPath) : null;
}

export function createGame(input: CreateGameInput): GameRecord {
  const title = input.title?.trim();
  if (!title) {
    throw new BadGameError("Title is required");
  }

  const kinds = parseKindsOrThrow(input.contentKinds);

  const id = crypto.randomUUID();
  const slug = input.slug?.trim()
    ? slugify(input.slug, id)
    : slugify(title, id);
  const now = new Date().toISOString();
  const db = getDb(input.dbPath);

  const existingSlug = db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.slug, slug))
    .get();
  if (existingSlug) {
    throw new GameConflictError("Game slug already exists", "game_slug_taken");
  }

  db.insert(games)
    .values({
      id,
      slug,
      title,
      description: input.description?.trim() || null,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  replaceContentKinds(id, kinds, input.dbPath);

  return getGame(id, { dbPath: input.dbPath })!;
}

export function patchGame(input: PatchGameInput): GameRecord {
  const db = getDb(input.dbPath);
  const existing = db.select().from(games).where(eq(games.id, input.id)).get();
  if (!existing) {
    throw new GameNotFoundError();
  }

  const kinds =
    input.contentKinds !== undefined
      ? parseKindsOrThrow(input.contentKinds)
      : undefined;

  const title =
    input.title !== undefined ? input.title.trim() : existing.title;
  if (!title) {
    throw new BadGameError("Title is required");
  }

  let slug = existing.slug;
  if (input.slug !== undefined) {
    slug = slugify(input.slug, existing.id);
    const clash = db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.slug, slug), ne(games.id, existing.id)))
      .get();
    if (clash) {
      throw new GameConflictError("Game slug already exists", "game_slug_taken");
    }
  }

  const description =
    input.description !== undefined
      ? input.description?.trim() || null
      : existing.description;

  const now = new Date().toISOString();
  db.update(games)
    .set({
      title,
      slug,
      description,
      updatedAt: now,
    })
    .where(eq(games.id, existing.id))
    .run();

  if (kinds !== undefined) {
    replaceContentKinds(existing.id, kinds, input.dbPath);
  }

  return getGame(existing.id, { dbPath: input.dbPath })!;
}

export function deleteGame(id: string, options?: GameServiceOptions): void {
  const db = getDb(options?.dbPath);
  const existing = db.select().from(games).where(eq(games.id, id)).get();
  if (!existing) {
    throw new GameNotFoundError();
  }

  db.transaction((tx) => {
    deleteContentTagsFor(
      tx,
      "cards",
      tx
        .select({ id: characterCards.id })
        .from(characterCards)
        .where(eq(characterCards.gameId, id))
        .all()
        .map((row) => row.id),
    );
    deleteContentTagsFor(
      tx,
      "scenes",
      tx
        .select({ id: scenes.id })
        .from(scenes)
        .where(eq(scenes.gameId, id))
        .all()
        .map((row) => row.id),
    );
    deleteContentTagsFor(
      tx,
      "clothes",
      tx
        .select({ id: clothes.id })
        .from(clothes)
        .where(eq(clothes.gameId, id))
        .all()
        .map((row) => row.id),
    );
    deleteContentTagsFor(
      tx,
      "softmods",
      tx
        .select({ id: softmods.id })
        .from(softmods)
        .where(eq(softmods.gameId, id))
        .all()
        .map((row) => row.id),
    );
    tx.delete(games).where(eq(games.id, id)).run();
  });
  removeGameIcons(id, options?.dataDir);
}

export function assertGameExists(
  gameId: string,
  options?: GameServiceOptions,
): void {
  if (!gameId?.trim()) {
    throw new BadGameError("gameId is required");
  }
  if (!getGame(gameId, options)) {
    throw new GameNotFoundError("Game not found");
  }
}

export function assertGameSupportsKind(
  gameId: string,
  kind: ContentKind,
  options?: GameServiceOptions,
): void {
  assertGameExists(gameId, options);
  const kinds = loadContentKinds(gameId, options?.dbPath);
  if (!kinds.some((k) => k.kind === kind)) {
    throw new BadGameError(
      `Game does not support content kind: ${kind}`,
      "kind_not_supported",
    );
  }
}
