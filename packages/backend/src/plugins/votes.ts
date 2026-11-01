import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { type PluginVoteValue, pluginVotes, plugins } from "../db/schema";
import { PluginNotFoundError } from "./errors";

export type PluginVoteCounts = {
  likes: number;
  dislikes: number;
  myVote: PluginVoteValue | null;
};

export type SetPluginVoteInput = {
  pluginId: string;
  userId: string;
  vote: PluginVoteValue | null;
  dbPath?: string;
};

function emptyCounts(myVote: PluginVoteValue | null = null): PluginVoteCounts {
  return { likes: 0, dislikes: 0, myVote };
}

export function getPluginVoteCountsForPlugins(
  pluginIds: string[],
  viewerUserId?: string | null,
  dbPath?: string,
): Map<string, PluginVoteCounts> {
  const result = new Map<string, PluginVoteCounts>();
  for (const id of pluginIds) {
    result.set(id, emptyCounts());
  }
  if (pluginIds.length === 0) return result;

  const db = getDb(dbPath);
  const rows = db
    .select({
      pluginId: pluginVotes.pluginId,
      vote: pluginVotes.vote,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(pluginVotes)
    .where(inArray(pluginVotes.pluginId, pluginIds))
    .groupBy(pluginVotes.pluginId, pluginVotes.vote)
    .all();

  for (const row of rows) {
    const counts = result.get(row.pluginId) ?? emptyCounts();
    if (row.vote === "like") counts.likes = row.count;
    else if (row.vote === "dislike") counts.dislikes = row.count;
    result.set(row.pluginId, counts);
  }

  if (viewerUserId) {
    const mine = db
      .select({
        pluginId: pluginVotes.pluginId,
        vote: pluginVotes.vote,
      })
      .from(pluginVotes)
      .where(
        and(
          inArray(pluginVotes.pluginId, pluginIds),
          eq(pluginVotes.userId, viewerUserId),
        ),
      )
      .all();

    for (const row of mine) {
      const counts = result.get(row.pluginId) ?? emptyCounts();
      counts.myVote = row.vote as PluginVoteValue;
      result.set(row.pluginId, counts);
    }
  }

  return result;
}

export function getPluginVoteCounts(
  pluginId: string,
  viewerUserId?: string | null,
  dbPath?: string,
): PluginVoteCounts {
  return (
    getPluginVoteCountsForPlugins([pluginId], viewerUserId, dbPath).get(
      pluginId,
    ) ?? emptyCounts()
  );
}

export function setPluginVote(input: SetPluginVoteInput): PluginVoteCounts {
  const db = getDb(input.dbPath);
  const plugin = db
    .select({ id: plugins.id })
    .from(plugins)
    .where(eq(plugins.id, input.pluginId))
    .get();

  if (!plugin) {
    throw new PluginNotFoundError();
  }

  const existing = db
    .select()
    .from(pluginVotes)
    .where(
      and(
        eq(pluginVotes.pluginId, input.pluginId),
        eq(pluginVotes.userId, input.userId),
      ),
    )
    .get();

  const now = new Date().toISOString();

  if (input.vote === null) {
    if (existing) {
      db.delete(pluginVotes).where(eq(pluginVotes.id, existing.id)).run();
    }
  } else if (existing) {
    db.update(pluginVotes)
      .set({ vote: input.vote, updatedAt: now })
      .where(eq(pluginVotes.id, existing.id))
      .run();
  } else {
    db.insert(pluginVotes)
      .values({
        id: crypto.randomUUID(),
        pluginId: input.pluginId,
        userId: input.userId,
        vote: input.vote,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  return getPluginVoteCounts(input.pluginId, input.userId, input.dbPath);
}

export function deleteVotesForPlugin(pluginId: string, dbPath?: string): void {
  const db = getDb(dbPath);
  db.delete(pluginVotes).where(eq(pluginVotes.pluginId, pluginId)).run();
}

export function getPluginLikesReceivedForAuthor(
  authorId: string,
  dbPath?: string,
): { likesReceived: number; dislikesReceived: number } {
  const db = getDb(dbPath);
  const rows = db
    .select({
      vote: pluginVotes.vote,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(pluginVotes)
    .innerJoin(plugins, eq(pluginVotes.pluginId, plugins.id))
    .where(eq(plugins.authorId, authorId))
    .groupBy(pluginVotes.vote)
    .all();

  let likesReceived = 0;
  let dislikesReceived = 0;
  for (const row of rows) {
    if (row.vote === "like") likesReceived = row.count;
    else if (row.vote === "dislike") dislikesReceived = row.count;
  }
  return { likesReceived, dislikesReceived };
}
