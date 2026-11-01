import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { type SceneVoteValue, sceneVotes, scenes } from "../db/schema";
import { SceneNotFoundError } from "./errors";

export type VoteCounts = {
  likes: number;
  dislikes: number;
  myVote: SceneVoteValue | null;
};

export type SetSceneVoteInput = {
  sceneId: string;
  userId: string;
  vote: SceneVoteValue | null;
  dbPath?: string;
};

function emptyCounts(myVote: SceneVoteValue | null = null): VoteCounts {
  return { likes: 0, dislikes: 0, myVote };
}

export function getVoteCountsForScenes(
  sceneIds: string[],
  viewerUserId?: string | null,
  dbPath?: string,
): Map<string, VoteCounts> {
  const result = new Map<string, VoteCounts>();
  for (const id of sceneIds) {
    result.set(id, emptyCounts());
  }
  if (sceneIds.length === 0) return result;

  const db = getDb(dbPath);
  const rows = db
    .select({
      sceneId: sceneVotes.sceneId,
      vote: sceneVotes.vote,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(sceneVotes)
    .where(inArray(sceneVotes.sceneId, sceneIds))
    .groupBy(sceneVotes.sceneId, sceneVotes.vote)
    .all();

  for (const row of rows) {
    const counts = result.get(row.sceneId) ?? emptyCounts();
    if (row.vote === "like") counts.likes = row.count;
    else if (row.vote === "dislike") counts.dislikes = row.count;
    result.set(row.sceneId, counts);
  }

  if (viewerUserId) {
    const mine = db
      .select({
        sceneId: sceneVotes.sceneId,
        vote: sceneVotes.vote,
      })
      .from(sceneVotes)
      .where(
        and(
          inArray(sceneVotes.sceneId, sceneIds),
          eq(sceneVotes.userId, viewerUserId),
        ),
      )
      .all();

    for (const row of mine) {
      const counts = result.get(row.sceneId) ?? emptyCounts();
      counts.myVote = row.vote as SceneVoteValue;
      result.set(row.sceneId, counts);
    }
  }

  return result;
}

export function getVoteCounts(
  sceneId: string,
  viewerUserId?: string | null,
  dbPath?: string,
): VoteCounts {
  return (
    getVoteCountsForScenes([sceneId], viewerUserId, dbPath).get(sceneId) ??
    emptyCounts()
  );
}

export function setSceneVote(input: SetSceneVoteInput): VoteCounts {
  const db = getDb(input.dbPath);
  const scene = db
    .select({ id: scenes.id })
    .from(scenes)
    .where(eq(scenes.id, input.sceneId))
    .get();

  if (!scene) {
    throw new SceneNotFoundError();
  }

  const existing = db
    .select()
    .from(sceneVotes)
    .where(
      and(
        eq(sceneVotes.sceneId, input.sceneId),
        eq(sceneVotes.userId, input.userId),
      ),
    )
    .get();

  const now = new Date().toISOString();

  if (input.vote === null) {
    if (existing) {
      db.delete(sceneVotes).where(eq(sceneVotes.id, existing.id)).run();
    }
  } else if (existing) {
    db.update(sceneVotes)
      .set({ vote: input.vote, updatedAt: now })
      .where(eq(sceneVotes.id, existing.id))
      .run();
  } else {
    db.insert(sceneVotes)
      .values({
        id: crypto.randomUUID(),
        sceneId: input.sceneId,
        userId: input.userId,
        vote: input.vote,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  return getVoteCounts(input.sceneId, input.userId, input.dbPath);
}

export function getLikesReceivedForAuthor(
  authorId: string,
  dbPath?: string,
): { likesReceived: number; dislikesReceived: number } {
  const db = getDb(dbPath);
  const rows = db
    .select({
      vote: sceneVotes.vote,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(sceneVotes)
    .innerJoin(scenes, eq(sceneVotes.sceneId, scenes.id))
    .where(eq(scenes.authorId, authorId))
    .groupBy(sceneVotes.vote)
    .all();

  let likesReceived = 0;
  let dislikesReceived = 0;
  for (const row of rows) {
    if (row.vote === "like") likesReceived = row.count;
    else if (row.vote === "dislike") dislikesReceived = row.count;
  }
  return { likesReceived, dislikesReceived };
}
