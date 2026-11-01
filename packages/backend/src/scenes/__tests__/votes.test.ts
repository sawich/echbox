import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { users } from "../../db/schema";
import { fixtureBytes } from "../../kkloader/__tests__/helpers";
import { createScene, getScene, listScenes } from "../service";
import {
  getLikesReceivedForAuthor,
  getVoteCounts,
  setSceneVote,
} from "../votes";

describe("scene votes", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let voterId: string;
  let sceneId: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-scene-votes-"));
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
          discordId: "discord-scene-vote-author",
          username: "scene_author",
          avatar: null,
          createdAt: now,
        },
        {
          id: voterId,
          discordId: "discord-scene-vote-voter",
          username: "voter",
          avatar: null,
          createdAt: now,
        },
      ])
      .run();

    const fileBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const created = await createScene({
      authorId,
      fileBytes,
      dbPath,
      dataDir,
    });
    sceneId = created.id;
  });

  afterEach(() => {
    delete process.env.DATABASE_PATH;
    delete process.env.DATA_DIR;
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("like and dislike update counts; null clears vote", () => {
    expect(getVoteCounts(sceneId, voterId, dbPath)).toEqual({
      likes: 0,
      dislikes: 0,
      myVote: null,
    });

    const liked = setSceneVote({
      sceneId,
      userId: voterId,
      vote: "like",
      dbPath,
    });
    expect(liked).toEqual({ likes: 1, dislikes: 0, myVote: "like" });

    const disliked = setSceneVote({
      sceneId,
      userId: voterId,
      vote: "dislike",
      dbPath,
    });
    expect(disliked).toEqual({ likes: 0, dislikes: 1, myVote: "dislike" });

    const cleared = setSceneVote({
      sceneId,
      userId: voterId,
      vote: null,
      dbPath,
    });
    expect(cleared).toEqual({ likes: 0, dislikes: 0, myVote: null });
  });

  test("listScenes and getScene reflect vote counts for viewer", async () => {
    setSceneVote({
      sceneId,
      userId: voterId,
      vote: "like",
      dbPath,
    });

    const detail = await getScene(sceneId, {
      dbPath,
      dataDir,
      viewerUserId: voterId,
    });
    expect(detail!.likes).toBe(1);
    expect(detail!.myVote).toBe("like");

    const list = await listScenes({
      dbPath,
      dataDir,
      viewerUserId: voterId,
    });
    expect(list[0]!.likes).toBe(1);
    expect(list[0]!.myVote).toBe("like");
  });

  test("getLikesReceivedForAuthor aggregates scene votes", () => {
    setSceneVote({
      sceneId,
      userId: voterId,
      vote: "like",
      dbPath,
    });

    expect(getLikesReceivedForAuthor(authorId, dbPath)).toEqual({
      likesReceived: 1,
      dislikesReceived: 0,
    });
  });
});
