import { and, count, desc, eq, ne } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  characterCards,
  games,
  plugins,
  scenes,
  softmods,
} from "../db/schema";
import {
  BadGameError,
  GameConflictError,
  GameNotFoundError,
} from "./errors";

export {
  BadGameError,
  GameConflictError,
  GameNotFoundError,
  GameServiceError,
} from "./errors";

export type GameServiceOptions = {
  dbPath?: string;
};

export type GameRecord = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateGameInput = GameServiceOptions & {
  title: string;
  slug?: string;
  description?: string | null;
  createdByUserId: string;
};

export type PatchGameInput = GameServiceOptions & {
  id: string;
  title?: string;
  slug?: string;
  description?: string | null;
};

function slugify(input: string, fallbackId: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `game-${fallbackId.slice(0, 8)}`;
}

function toRecord(row: typeof games.$inferSelect): GameRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listGames(options?: GameServiceOptions): GameRecord[] {
  const db = getDb(options?.dbPath);
  return db
    .select()
    .from(games)
    .orderBy(desc(games.createdAt))
    .all()
    .map(toRecord);
}

export function getGame(
  id: string,
  options?: GameServiceOptions,
): GameRecord | null {
  const db = getDb(options?.dbPath);
  const row = db.select().from(games).where(eq(games.id, id)).get();
  return row ? toRecord(row) : null;
}

export function createGame(input: CreateGameInput): GameRecord {
  const title = input.title?.trim();
  if (!title) {
    throw new BadGameError("Title is required");
  }

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

  return getGame(id, { dbPath: input.dbPath })!;
}

export function patchGame(input: PatchGameInput): GameRecord {
  const db = getDb(input.dbPath);
  const existing = db.select().from(games).where(eq(games.id, input.id)).get();
  if (!existing) {
    throw new GameNotFoundError();
  }

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

  return getGame(existing.id, { dbPath: input.dbPath })!;
}

function contentCountForGame(gameId: string, dbPath?: string): number {
  const db = getDb(dbPath);
  const cards = db
    .select({ n: count() })
    .from(characterCards)
    .where(eq(characterCards.gameId, gameId))
    .get()?.n;
  const sceneN = db
    .select({ n: count() })
    .from(scenes)
    .where(eq(scenes.gameId, gameId))
    .get()?.n;
  const pluginN = db
    .select({ n: count() })
    .from(plugins)
    .where(eq(plugins.gameId, gameId))
    .get()?.n;
  const softmodN = db
    .select({ n: count() })
    .from(softmods)
    .where(eq(softmods.gameId, gameId))
    .get()?.n;
  return (cards ?? 0) + (sceneN ?? 0) + (pluginN ?? 0) + (softmodN ?? 0);
}

export function deleteGame(id: string, options?: GameServiceOptions): void {
  const db = getDb(options?.dbPath);
  const existing = db.select().from(games).where(eq(games.id, id)).get();
  if (!existing) {
    throw new GameNotFoundError();
  }

  const refs = contentCountForGame(id, options?.dbPath);
  if (refs > 0) {
    throw new GameConflictError(
      "Game still has content; remove content before deleting",
      "game_has_content",
    );
  }

  db.delete(games).where(eq(games.id, id)).run();
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
