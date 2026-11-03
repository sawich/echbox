import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { type ClothesVoteValue, clothesVotes, clothes } from "../db/schema";
import { ClothesNotFoundError } from "./errors";

export type VoteCounts = {
  likes: number;
  dislikes: number;
  myVote: ClothesVoteValue | null;
};

export type SetClothesVoteInput = {
  clothesId: string;
  userId: string;
  vote: ClothesVoteValue | null;
  dbPath?: string;
};

function emptyCounts(myVote: ClothesVoteValue | null = null): VoteCounts {
  return { likes: 0, dislikes: 0, myVote };
}

export function getVoteCountsForClothes(
  clothesIds: string[],
  viewerUserId?: string | null,
  dbPath?: string,
): Map<string, VoteCounts> {
  const result = new Map<string, VoteCounts>();
  for (const id of clothesIds) {
    result.set(id, emptyCounts());
  }
  if (clothesIds.length === 0) return result;

  const db = getDb(dbPath);
  const rows = db
    .select({
      clothesId: clothesVotes.clothesId,
      vote: clothesVotes.vote,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(clothesVotes)
    .where(inArray(clothesVotes.clothesId, clothesIds))
    .groupBy(clothesVotes.clothesId, clothesVotes.vote)
    .all();

  for (const row of rows) {
    const counts = result.get(row.clothesId) ?? emptyCounts();
    if (row.vote === "like") counts.likes = row.count;
    else if (row.vote === "dislike") counts.dislikes = row.count;
    result.set(row.clothesId, counts);
  }

  if (viewerUserId) {
    const mine = db
      .select({
        clothesId: clothesVotes.clothesId,
        vote: clothesVotes.vote,
      })
      .from(clothesVotes)
      .where(
        and(
          inArray(clothesVotes.clothesId, clothesIds),
          eq(clothesVotes.userId, viewerUserId),
        ),
      )
      .all();

    for (const row of mine) {
      const counts = result.get(row.clothesId) ?? emptyCounts();
      counts.myVote = row.vote as ClothesVoteValue;
      result.set(row.clothesId, counts);
    }
  }

  return result;
}

export function getVoteCounts(
  clothesId: string,
  viewerUserId?: string | null,
  dbPath?: string,
): VoteCounts {
  return (
    getVoteCountsForClothes([clothesId], viewerUserId, dbPath).get(clothesId) ??
    emptyCounts()
  );
}

export function setClothesVote(input: SetClothesVoteInput): VoteCounts {
  const db = getDb(input.dbPath);
  const row = db
    .select({ id: clothes.id })
    .from(clothes)
    .where(eq(clothes.id, input.clothesId))
    .get();

  if (!row) {
    throw new ClothesNotFoundError();
  }

  const existing = db
    .select()
    .from(clothesVotes)
    .where(
      and(
        eq(clothesVotes.clothesId, input.clothesId),
        eq(clothesVotes.userId, input.userId),
      ),
    )
    .get();

  const now = new Date().toISOString();

  if (input.vote === null) {
    if (existing) {
      db.delete(clothesVotes).where(eq(clothesVotes.id, existing.id)).run();
    }
  } else if (existing) {
    db.update(clothesVotes)
      .set({ vote: input.vote, updatedAt: now })
      .where(eq(clothesVotes.id, existing.id))
      .run();
  } else {
    db.insert(clothesVotes)
      .values({
        id: crypto.randomUUID(),
        clothesId: input.clothesId,
        userId: input.userId,
        vote: input.vote,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  return getVoteCounts(input.clothesId, input.userId, input.dbPath);
}

export function getLikesReceivedForAuthor(
  authorId: string,
  dbPath?: string,
): { likesReceived: number; dislikesReceived: number } {
  const db = getDb(dbPath);
  const rows = db
    .select({
      vote: clothesVotes.vote,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(clothesVotes)
    .innerJoin(clothes, eq(clothesVotes.clothesId, clothes.id))
    .where(eq(clothes.authorId, authorId))
    .groupBy(clothesVotes.vote)
    .all();

  let likesReceived = 0;
  let dislikesReceived = 0;
  for (const row of rows) {
    if (row.vote === "like") likesReceived = row.count;
    else if (row.vote === "dislike") dislikesReceived = row.count;
  }
  return { likesReceived, dislikesReceived };
}
