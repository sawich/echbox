import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { users } from "../../db/schema";
import { fixtureBytes } from "../../kkloader/__tests__/helpers";
import { seedTestGame } from "../../__tests__/test-game";
import { createSoftmod, getSoftmod, listSoftmods } from "../service";
import {
  getSoftmodLikesReceivedForAuthor,
  getSoftmodVoteCounts,
  setSoftmodVote,
} from "../votes";

describe("softmod votes", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let gameId: string;
  let voterId: string;
  let softmodId: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-softmod-votes-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;

    migrateDb(dbPath);
    const db = getDb(dbPath);

    authorId = crypto.randomUUID();
    voterId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(users)
      .values([
        {
          id: authorId,
          discordId: "discord-vote-author",
          username: "mod_author",
          avatar: null,
          createdAt: now,
        },
        {
          id: voterId,
          discordId: "discord-vote-voter",
          username: "voter",
          avatar: null,
          createdAt: now,
        },
      ])
      .run();

    gameId = seedTestGame(authorId, { dbPath }).id;

    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const created = await createSoftmod({ gameId,
      uploaderId: authorId,
      semver: "1.2.3",
      fileBytes,
      dbPath,
      dataDir,
    });
    softmodId = created.id;
  });

  afterEach(() => {
    delete process.env.DATABASE_PATH;
    delete process.env.DATA_DIR;
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("like and dislike update counts; null clears vote", () => {
    expect(getSoftmodVoteCounts(softmodId, voterId, dbPath)).toEqual({
      likes: 0,
      dislikes: 0,
      myVote: null,
    });

    const liked = setSoftmodVote({
      softmodId,
      userId: voterId,
      vote: "like",
      dbPath,
    });
    expect(liked).toEqual({ likes: 1, dislikes: 0, myVote: "like" });

    const disliked = setSoftmodVote({
      softmodId,
      userId: voterId,
      vote: "dislike",
      dbPath,
    });
    expect(disliked).toEqual({ likes: 0, dislikes: 1, myVote: "dislike" });

    const cleared = setSoftmodVote({
      softmodId,
      userId: voterId,
      vote: null,
      dbPath,
    });
    expect(cleared).toEqual({ likes: 0, dislikes: 0, myVote: null });
  });

  test("listSoftmods and getSoftmod reflect vote counts after setSoftmodVote", async () => {
    setSoftmodVote({
      softmodId,
      userId: voterId,
      vote: "like",
      dbPath,
    });

    const detail = await getSoftmod(softmodId, {
      dbPath,
      dataDir,
      viewerUserId: voterId,
    });
    expect(detail!.likes).toBe(1);
    expect(detail!.dislikes).toBe(0);
    expect(detail!.myVote).toBe("like");

    const list = (await listSoftmods({
      dbPath,
      dataDir,
      viewerUserId: voterId,
    })).items;
    expect(list).toHaveLength(1);
    expect(list[0]!.likes).toBe(1);
    expect(list[0]!.myVote).toBe("like");
  });

  test("getSoftmodLikesReceivedForAuthor aggregates votes on author uploads", () => {
    setSoftmodVote({
      softmodId,
      userId: voterId,
      vote: "like",
      dbPath,
    });

    expect(getSoftmodLikesReceivedForAuthor(authorId, dbPath)).toEqual({
      likesReceived: 1,
      dislikesReceived: 0,
    });
  });
});
