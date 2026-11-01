import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  type CardVoteValue,
  cardVotes,
  characterCards,
} from "../db/schema";
import { CardNotFoundError } from "./errors";

export type VoteCounts = {
  likes: number;
  dislikes: number;
  myVote: CardVoteValue | null;
};

export type SetVoteInput = {
  cardId: string;
  userId: string;
  vote: CardVoteValue | null;
  dbPath?: string;
};

function emptyCounts(myVote: CardVoteValue | null = null): VoteCounts {
  return { likes: 0, dislikes: 0, myVote };
}

export function getVoteCountsForCards(
  cardIds: string[],
  viewerUserId?: string | null,
  dbPath?: string,
): Map<string, VoteCounts> {
  const result = new Map<string, VoteCounts>();
  for (const id of cardIds) {
    result.set(id, emptyCounts());
  }
  if (cardIds.length === 0) return result;

  const db = getDb(dbPath);
  const rows = db
    .select({
      cardId: cardVotes.cardId,
      vote: cardVotes.vote,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(cardVotes)
    .where(inArray(cardVotes.cardId, cardIds))
    .groupBy(cardVotes.cardId, cardVotes.vote)
    .all();

  for (const row of rows) {
    const counts = result.get(row.cardId) ?? emptyCounts();
    if (row.vote === "like") counts.likes = row.count;
    else if (row.vote === "dislike") counts.dislikes = row.count;
    result.set(row.cardId, counts);
  }

  if (viewerUserId) {
    const mine = db
      .select({
        cardId: cardVotes.cardId,
        vote: cardVotes.vote,
      })
      .from(cardVotes)
      .where(
        and(
          inArray(cardVotes.cardId, cardIds),
          eq(cardVotes.userId, viewerUserId),
        ),
      )
      .all();

    for (const row of mine) {
      const counts = result.get(row.cardId) ?? emptyCounts();
      counts.myVote = row.vote as CardVoteValue;
      result.set(row.cardId, counts);
    }
  }

  return result;
}

export function getVoteCounts(
  cardId: string,
  viewerUserId?: string | null,
  dbPath?: string,
): VoteCounts {
  return (
    getVoteCountsForCards([cardId], viewerUserId, dbPath).get(cardId) ??
    emptyCounts()
  );
}

export function setCardVote(input: SetVoteInput): VoteCounts {
  const db = getDb(input.dbPath);
  const card = db
    .select({ id: characterCards.id })
    .from(characterCards)
    .where(eq(characterCards.id, input.cardId))
    .get();

  if (!card) {
    throw new CardNotFoundError();
  }

  const existing = db
    .select()
    .from(cardVotes)
    .where(
      and(
        eq(cardVotes.cardId, input.cardId),
        eq(cardVotes.userId, input.userId),
      ),
    )
    .get();

  const now = new Date().toISOString();

  if (input.vote === null) {
    if (existing) {
      db.delete(cardVotes).where(eq(cardVotes.id, existing.id)).run();
    }
  } else if (existing) {
    db.update(cardVotes)
      .set({ vote: input.vote, updatedAt: now })
      .where(eq(cardVotes.id, existing.id))
      .run();
  } else {
    db.insert(cardVotes)
      .values({
        id: crypto.randomUUID(),
        cardId: input.cardId,
        userId: input.userId,
        vote: input.vote,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  return getVoteCounts(input.cardId, input.userId, input.dbPath);
}

export function deleteVotesForCard(cardId: string, dbPath?: string): void {
  const db = getDb(dbPath);
  db.delete(cardVotes).where(eq(cardVotes.cardId, cardId)).run();
}

export function getLikesReceivedForAuthor(
  authorId: string,
  dbPath?: string,
): { likesReceived: number; dislikesReceived: number } {
  const db = getDb(dbPath);
  const rows = db
    .select({
      vote: cardVotes.vote,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(cardVotes)
    .innerJoin(characterCards, eq(cardVotes.cardId, characterCards.id))
    .where(eq(characterCards.authorId, authorId))
    .groupBy(cardVotes.vote)
    .all();

  let likesReceived = 0;
  let dislikesReceived = 0;
  for (const row of rows) {
    if (row.vote === "like") likesReceived = row.count;
    else if (row.vote === "dislike") dislikesReceived = row.count;
  }
  return { likesReceived, dislikesReceived };
}
