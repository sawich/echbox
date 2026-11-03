import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../app";
import { createSession } from "../auth/session";
import { getDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { users } from "../db/schema";
import { fixtureBytes } from "../kkloader/__tests__/helpers";
import { seedTestGame } from "./test-game";

describe("card votes", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let gameId: string;
  let voterId: string;
  let authorCookie: string;
  let voterCookie: string;
  let cardId: string;

  const origDbPath = process.env.DATABASE_PATH;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-votes-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    Bun.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;
    Bun.env.DATA_DIR = dataDir;

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
          username: "vote_author",
          avatar: null,
          createdAt: now,
        },
        {
          id: voterId,
          discordId: "discord-vote-voter",
          username: "vote_voter",
          avatar: "https://cdn.example/avatar.png",
          createdAt: now,
        },
      ])
      .run();

    gameId = seedTestGame(authorId, { dbPath }).id;

    authorCookie = (await createSession(authorId, dbPath)).cookie.split(";")[0]!;
    voterCookie = (await createSession(voterId, dbPath)).cookie.split(";")[0]!;

    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const form = new FormData();
    form.append("gameId", gameId);
    form.append("semver", "1.0.0");
    form.append(
      "file",
      new File([fileBytes], "kk_chara.png", { type: "image/png" }),
    );
    form.append("title", "Vote Target");

    const createRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };
    cardId = created.id;
  });

  afterEach(() => {
    if (origDbPath === undefined) {
      delete process.env.DATABASE_PATH;
      delete Bun.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = origDbPath;
      Bun.env.DATABASE_PATH = origDbPath;
    }
    if (origDataDir === undefined) {
      delete process.env.DATA_DIR;
      delete Bun.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = origDataDir;
      Bun.env.DATA_DIR = origDataDir;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("PUT /vote requires auth", async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/kk/cards/${cardId}/vote`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vote: "like" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("like increments likes; same user can switch to dislike; null clears", async () => {
    const likeRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${cardId}/vote`, {
        method: "PUT",
        headers: {
          cookie: voterCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ vote: "like" }),
      }),
    );
    expect(likeRes.status).toBe(200);
    const liked = (await likeRes.json()) as {
      likes: number;
      dislikes: number;
      myVote: "like" | "dislike" | null;
    };
    expect(liked).toEqual({ likes: 1, dislikes: 0, myVote: "like" });

    const switchRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${cardId}/vote`, {
        method: "PUT",
        headers: {
          cookie: voterCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ vote: "dislike" }),
      }),
    );
    expect(switchRes.status).toBe(200);
    expect(await switchRes.json()).toEqual({
      likes: 0,
      dislikes: 1,
      myVote: "dislike",
    });

    const clearRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${cardId}/vote`, {
        method: "PUT",
        headers: {
          cookie: voterCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ vote: null }),
      }),
    );
    expect(clearRes.status).toBe(200);
    expect(await clearRes.json()).toEqual({
      likes: 0,
      dislikes: 0,
      myVote: null,
    });
  });

  test("card detail and list include vote counts and myVote for authed viewer", async () => {
    await app.handle(
      new Request(`http://localhost/api/kk/cards/${cardId}/vote`, {
        method: "PUT",
        headers: {
          cookie: voterCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ vote: "like" }),
      }),
    );

    const detailGuest = await app.handle(
      new Request(`http://localhost/api/kk/cards/${cardId}`),
    );
    expect(detailGuest.status).toBe(200);
    const guestBody = (await detailGuest.json()) as {
      likes: number;
      dislikes: number;
      myVote: "like" | "dislike" | null;
    };
    expect(guestBody.likes).toBe(1);
    expect(guestBody.dislikes).toBe(0);
    expect(guestBody.myVote).toBeNull();

    const detailVoter = await app.handle(
      new Request(`http://localhost/api/kk/cards/${cardId}`, {
        headers: { cookie: voterCookie },
      }),
    );
    const voterBody = (await detailVoter.json()) as {
      likes: number;
      myVote: string | null;
    };
    expect(voterBody.likes).toBe(1);
    expect(voterBody.myVote).toBe("like");

    const listRes = await app.handle(
      new Request("http://localhost/api/kk/cards?type=character", {
        headers: { cookie: voterCookie },
      }),
    );
    const listBody = (await listRes.json()) as {
      cards: { id: string; likes: number; dislikes: number; myVote: string | null }[];
    };
    const item = listBody.cards.find((c) => c.id === cardId)!;
    expect(item.likes).toBe(1);
    expect(item.dislikes).toBe(0);
    expect(item.myVote).toBe("like");
  });

  test("voting on unknown card returns 404", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards/missing/vote", {
        method: "PUT",
        headers: {
          cookie: voterCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ vote: "like" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  test("deleting a card removes its votes", async () => {
    await app.handle(
      new Request(`http://localhost/api/kk/cards/${cardId}/vote`, {
        method: "PUT",
        headers: {
          cookie: voterCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ vote: "like" }),
      }),
    );

    const del = await app.handle(
      new Request(`http://localhost/api/kk/cards/${cardId}`, {
        method: "DELETE",
        headers: { cookie: authorCookie },
      }),
    );
    expect(del.status).toBe(200);

    const fileBytes = await fixtureBytes("chara", "kk_chara.png");
    const form = new FormData();
    form.append("gameId", gameId);
    form.append("semver", "1.0.0");
    form.append(
      "file",
      new File([fileBytes], "kk_chara.png", { type: "image/png" }),
    );
    form.append("title", "Vote Target 2");
    const createRes = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: form,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      likes: number;
      dislikes: number;
    };
    expect(created.likes).toBe(0);
    expect(created.dislikes).toBe(0);
  });
});
