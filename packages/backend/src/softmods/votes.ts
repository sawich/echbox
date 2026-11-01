import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  type SoftmodVoteValue,
  softmodVotes,
  softmods,
} from "../db/schema";
import { SoftmodNotFoundError } from "./errors";

export type SoftmodVoteCounts = {
  likes: number;
  dislikes: number;
  myVote: SoftmodVoteValue | null;
};

export type SetSoftmodVoteInput = {
  softmodId: string;
  userId: string;
  vote: SoftmodVoteValue | null;
  dbPath?: string;
};

function emptyCounts(myVote: SoftmodVoteValue | null = null): SoftmodVoteCounts {
  return { likes: 0, dislikes: 0, myVote };
}

export function getSoftmodVoteCountsForSoftmods(
  softmodIds: string[],
  viewerUserId?: string | null,
  dbPath?: string,
): Map<string, SoftmodVoteCounts> {
  const result = new Map<string, SoftmodVoteCounts>();
  for (const id of softmodIds) {
    result.set(id, emptyCounts());
  }
  if (softmodIds.length === 0) return result;

  const db = getDb(dbPath);
  const rows = db
    .select({
      softmodId: softmodVotes.softmodId,
      vote: softmodVotes.vote,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(softmodVotes)
    .where(inArray(softmodVotes.softmodId, softmodIds))
    .groupBy(softmodVotes.softmodId, softmodVotes.vote)
    .all();

  for (const row of rows) {
    const counts = result.get(row.softmodId) ?? emptyCounts();
    if (row.vote === "like") counts.likes = row.count;
    else if (row.vote === "dislike") counts.dislikes = row.count;
    result.set(row.softmodId, counts);
  }

  if (viewerUserId) {
    const mine = db
      .select({
        softmodId: softmodVotes.softmodId,
        vote: softmodVotes.vote,
      })
      .from(softmodVotes)
      .where(
        and(
          inArray(softmodVotes.softmodId, softmodIds),
          eq(softmodVotes.userId, viewerUserId),
        ),
      )
      .all();

    for (const row of mine) {
      const counts = result.get(row.softmodId) ?? emptyCounts();
      counts.myVote = row.vote as SoftmodVoteValue;
      result.set(row.softmodId, counts);
    }
  }

  return result;
}

export function getSoftmodVoteCounts(
  softmodId: string,
  viewerUserId?: string | null,
  dbPath?: string,
): SoftmodVoteCounts {
  return (
    getSoftmodVoteCountsForSoftmods([softmodId], viewerUserId, dbPath).get(
      softmodId,
    ) ?? emptyCounts()
  );
}

export function setSoftmodVote(input: SetSoftmodVoteInput): SoftmodVoteCounts {
  const db = getDb(input.dbPath);
  const softmod = db
    .select({ id: softmods.id })
    .from(softmods)
    .where(eq(softmods.id, input.softmodId))
    .get();

  if (!softmod) {
    throw new SoftmodNotFoundError();
  }

  const existing = db
    .select()
    .from(softmodVotes)
    .where(
      and(
        eq(softmodVotes.softmodId, input.softmodId),
        eq(softmodVotes.userId, input.userId),
      ),
    )
    .get();

  const now = new Date().toISOString();

  if (input.vote === null) {
    if (existing) {
      db.delete(softmodVotes).where(eq(softmodVotes.id, existing.id)).run();
    }
  } else if (existing) {
    db.update(softmodVotes)
      .set({ vote: input.vote, updatedAt: now })
      .where(eq(softmodVotes.id, existing.id))
      .run();
  } else {
    db.insert(softmodVotes)
      .values({
        id: crypto.randomUUID(),
        softmodId: input.softmodId,
        userId: input.userId,
        vote: input.vote,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  return getSoftmodVoteCounts(input.softmodId, input.userId, input.dbPath);
}

export function deleteVotesForSoftmod(softmodId: string, dbPath?: string): void {
  const db = getDb(dbPath);
  db.delete(softmodVotes).where(eq(softmodVotes.softmodId, softmodId)).run();
}

export function getSoftmodLikesReceivedForAuthor(
  authorId: string,
  dbPath?: string,
): { likesReceived: number; dislikesReceived: number } {
  const db = getDb(dbPath);
  const rows = db
    .select({
      vote: softmodVotes.vote,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(softmodVotes)
    .innerJoin(softmods, eq(softmodVotes.softmodId, softmods.id))
    .where(eq(softmods.authorId, authorId))
    .groupBy(softmodVotes.vote)
    .all();

  let likesReceived = 0;
  let dislikesReceived = 0;
  for (const row of rows) {
    if (row.vote === "like") likesReceived = row.count;
    else if (row.vote === "dislike") dislikesReceived = row.count;
  }
  return { likesReceived, dislikesReceived };
}
