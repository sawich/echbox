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

const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("tag and preview HTTP routes", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let otherUserId: string;
  let adminId: string;
  let gameId: string;
  let authorCookie: string;
  let otherCookie: string;
  let adminCookie: string;

  const origDbPath = process.env.DATABASE_PATH;
  const origDataDir = process.env.DATA_DIR;
  const origAdmins = process.env.ADMIN_DISCORD_IDS;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-tags-http-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    Bun.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;
    Bun.env.DATA_DIR = dataDir;
    process.env.ADMIN_DISCORD_IDS = "discord-tag-admin";
    Bun.env.ADMIN_DISCORD_IDS = "discord-tag-admin";

    migrateDb(dbPath);
    const db = getDb(dbPath);
    authorId = crypto.randomUUID();
    otherUserId = crypto.randomUUID();
    adminId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.insert(users)
      .values([
        {
          id: authorId,
          discordId: "discord-tag-author",
          username: "tag_author",
          avatar: null,
          createdAt: now,
        },
        {
          id: otherUserId,
          discordId: "discord-tag-other",
          username: "tag_other",
          avatar: null,
          createdAt: now,
        },
        {
          id: adminId,
          discordId: "discord-tag-admin",
          username: "tag_admin",
          avatar: null,
          createdAt: now,
        },
      ])
      .run();
    gameId = seedTestGame(authorId, { dbPath }).id;
    authorCookie = (await createSession(authorId, dbPath)).cookie.split(";")[0]!;
    otherCookie = (await createSession(otherUserId, dbPath)).cookie.split(";")[0]!;
    adminCookie = (await createSession(adminId, dbPath)).cookie.split(";")[0]!;
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
    if (origAdmins === undefined) {
      delete process.env.ADMIN_DISCORD_IDS;
      delete Bun.env.ADMIN_DISCORD_IDS;
    } else {
      process.env.ADMIN_DISCORD_IDS = origAdmins;
      Bun.env.ADMIN_DISCORD_IDS = origAdmins;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function uploadCard(fileName: string, cookie: string) {
    const fileBytes = await fixtureBytes("chara", fileName);
    const form = new FormData();
    form.append("semver", "1.0.0");
    form.append("gameId", gameId);
    form.append("file", new File([fileBytes], fileName, { type: "image/png" }));
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards", {
        method: "POST",
        headers: { cookie },
        body: form,
      }),
    );
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string };
  }

  async function uploadSoftmod(cookie: string) {
    const fileBytes = await fixtureBytes("softmods", "testmod.zipmod");
    const form = new FormData();
    form.append(
      "file",
      new File([fileBytes], "testmod.zipmod", { type: "application/zip" }),
    );
    form.append("semver", "1.0.0");
    form.append("gameId", gameId);
    const res = await app.handle(
      new Request("http://localhost/api/softmods", {
        method: "POST",
        headers: { cookie },
        body: form,
      }),
    );
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string; description: string };
  }

  test("GET /api/tags/suggest matches a prefix and skips excluded names", async () => {
    const createRes = await app.handle(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "blonde hair", category: "general" }),
      }),
    );
    expect(createRes.status).toBe(201);

    const suggestRes = await app.handle(
      new Request("http://localhost/api/tags/suggest?q=blonde"),
    );
    expect(suggestRes.status).toBe(200);
    const suggested = (await suggestRes.json()) as {
      tags: { name: string; category: string }[];
    };
    expect(suggested.tags.map((tag) => tag.name)).toContain("blonde_hair");

    const excluded = await app.handle(
      new Request(
        "http://localhost/api/tags/suggest?q=blonde&exclude=blonde_hair",
      ),
    );
    expect(excluded.status).toBe(200);
    const excludedBody = (await excluded.json()) as { tags: { name: string }[] };
    expect(excludedBody.tags.map((tag) => tag.name)).not.toContain("blonde_hair");
  });

  test("card list AND-filters tags and only the uploader can set them", async () => {
    const both = await uploadCard("kk_chara.png", authorCookie);
    const onlyRed = await uploadCard("kk_mod_chara.png", authorCookie);
    const onlyHair = await uploadCard("kk_tatsumaki_fubuki.png", authorCookie);

    const forbidRes = await app.handle(
      new Request(`http://localhost/api/kk/cards/${both.id}/tags`, {
        method: "PUT",
        headers: {
          cookie: otherCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tags: ["red", "hair"] }),
      }),
    );
    expect(forbidRes.status).toBe(403);

    const putBoth = await app.handle(
      new Request(`http://localhost/api/kk/cards/${both.id}/tags`, {
        method: "PUT",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tags: ["red", "hair"] }),
      }),
    );
    expect(putBoth.status).toBe(200);
    const bothTags = (await putBoth.json()) as { tags: { name: string }[] };
    expect(bothTags.tags.map((tag) => tag.name).sort()).toEqual(["hair", "red"]);

    const putRed = await app.handle(
      new Request(`http://localhost/api/kk/cards/${onlyRed.id}/tags`, {
        method: "PUT",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tags: ["red"] }),
      }),
    );
    expect(putRed.status).toBe(200);

    const putHair = await app.handle(
      new Request(`http://localhost/api/kk/cards/${onlyHair.id}/tags`, {
        method: "PUT",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tags: ["hair"] }),
      }),
    );
    expect(putHair.status).toBe(200);

    const getTags = await app.handle(
      new Request(`http://localhost/api/kk/cards/${both.id}/tags`),
    );
    expect(getTags.status).toBe(200);
    const listed = (await getTags.json()) as { tags: { name: string }[] };
    expect(listed.tags.map((tag) => tag.name).sort()).toEqual(["hair", "red"]);

    const andRes = await app.handle(
      new Request("http://localhost/api/kk/cards?tags=red&tags=hair"),
    );
    expect(andRes.status).toBe(200);
    const andBody = (await andRes.json()) as { cards: { id: string }[] };
    expect(andBody.cards.map((card) => card.id)).toEqual([both.id]);

    const commaRes = await app.handle(
      new Request("http://localhost/api/kk/cards?tags=red,hair"),
    );
    const commaBody = (await commaRes.json()) as { cards: { id: string }[] };
    expect(commaBody.cards.map((card) => card.id)).toEqual([both.id]);
  });

  test("non-admin cannot create a restricted tag; admin can moderate it", async () => {
    const anon = await app.handle(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "mystery_author", category: "author" }),
      }),
    );
    expect(anon.status).toBe(401);

    const forbidden = await app.handle(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "mystery author", category: "author" }),
      }),
    );
    expect(forbidden.status).toBe(403);

    const createdRes = await app.handle(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: {
          cookie: adminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "mystery author", category: "author" }),
      }),
    );
    expect(createdRes.status).toBe(201);
    const created = (await createdRes.json()) as {
      id: string;
      name: string;
      category: string;
    };
    expect(created.name).toBe("mystery_author");
    expect(created.category).toBe("author");

    const aliasForbidden = await app.handle(
      new Request(`http://localhost/api/tags/${created.id}/aliases`, {
        method: "POST",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ alias: "mystery" }),
      }),
    );
    expect(aliasForbidden.status).toBe(403);

    const aliasRes = await app.handle(
      new Request(`http://localhost/api/tags/${created.id}/aliases`, {
        method: "POST",
        headers: {
          cookie: adminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ alias: "mystery" }),
      }),
    );
    expect(aliasRes.status).toBe(201);

    const patchForbidden = await app.handle(
      new Request(`http://localhost/api/tags/${created.id}`, {
        method: "PATCH",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ category: "general" }),
      }),
    );
    expect(patchForbidden.status).toBe(403);

    const patchRes = await app.handle(
      new Request(`http://localhost/api/tags/${created.id}`, {
        method: "PATCH",
        headers: {
          cookie: adminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ category: "license" }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { category: string };
    expect(patched.category).toBe("license");

    const deleteForbidden = await app.handle(
      new Request(`http://localhost/api/tags/${created.id}`, {
        method: "DELETE",
        headers: { cookie: authorCookie },
      }),
    );
    expect(deleteForbidden.status).toBe(403);

    const deleteRes = await app.handle(
      new Request(`http://localhost/api/tags/${created.id}`, {
        method: "DELETE",
        headers: { cookie: adminCookie },
      }),
    );
    expect(deleteRes.status).toBe(200);

    const missing = await app.handle(
      new Request(`http://localhost/api/tags/${created.id}`),
    );
    expect(missing.status).toBe(404);
  });

  test("PUT /api/tags/:id/vote requires auth and stores the vote", async () => {
    const createRes = await app.handle(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "voted_tag", category: "general" }),
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const anon = await app.handle(
      new Request(`http://localhost/api/tags/${created.id}/vote`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vote: "like" }),
      }),
    );
    expect(anon.status).toBe(401);

    const voteRes = await app.handle(
      new Request(`http://localhost/api/tags/${created.id}/vote`, {
        method: "PUT",
        headers: {
          cookie: otherCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ vote: "like" }),
      }),
    );
    expect(voteRes.status).toBe(200);
    const counts = (await voteRes.json()) as {
      likes: number;
      dislikes: number;
      myVote: string | null;
    };
    expect(counts).toEqual({ likes: 1, dislikes: 0, myVote: "like" });

    const listRes = await app.handle(
      new Request("http://localhost/api/tags?q=voted", {
        headers: { cookie: otherCookie },
      }),
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      tags: { name: string; likes: number; myVote: string | null }[];
      total: number;
    };
    expect(listBody.total).toBe(1);
    expect(listBody.tags[0]!.name).toBe("voted_tag");
    expect(listBody.tags[0]!.likes).toBe(1);
    expect(listBody.tags[0]!.myVote).toBe("like");
  });

  test("softmod previews cap at 3 and the preview URL serves webp", async () => {
    const softmod = await uploadSoftmod(authorCookie);

    const patchRes = await app.handle(
      new Request(`http://localhost/api/softmods/${softmod.id}`, {
        method: "PATCH",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ description: "Edited blurb" }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { description: string };
    expect(patched.description).toBe("Edited blurb");

    const urls: string[] = [];
    for (let i = 0; i < 3; i++) {
      const form = new FormData();
      form.append("file", new File([ONE_PX_PNG], "preview.png", { type: "image/png" }));
      const res = await app.handle(
        new Request(`http://localhost/api/softmods/${softmod.id}/previews`, {
          method: "POST",
          headers: { cookie: authorCookie },
          body: form,
        }),
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { url: string };
      urls.push(body.url);
    }

    const fourth = new FormData();
    fourth.append("file", new File([ONE_PX_PNG], "preview.png", { type: "image/png" }));
    const capped = await app.handle(
      new Request(`http://localhost/api/softmods/${softmod.id}/previews`, {
        method: "POST",
        headers: { cookie: authorCookie },
        body: fourth,
      }),
    );
    expect(capped.status).toBe(400);

    const imageRes = await app.handle(new Request(`http://localhost${urls[0]}`));
    expect(imageRes.status).toBe(200);
    expect(imageRes.headers.get("content-type")).toContain("image/webp");
    const bytes = new Uint8Array(await imageRes.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");

    const reversedIds = [...urls].reverse().map((url) => url.split("/").pop()!);
    const reorderRes = await app.handle(
      new Request(`http://localhost/api/softmods/${softmod.id}/previews`, {
        method: "PUT",
        headers: {
          cookie: authorCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ orderedIds: reversedIds }),
      }),
    );
    expect(reorderRes.status).toBe(200);
    const reordered = (await reorderRes.json()) as { previews: { url: string }[] };
    expect(reordered.previews.map((preview) => preview.url)).toEqual(
      [...urls].reverse(),
    );

    const detailRes = await app.handle(
      new Request(`http://localhost/api/softmods/${softmod.id}`),
    );
    const detail = (await detailRes.json()) as { previewUrls: string[] };
    expect(detail.previewUrls).toEqual([...urls].reverse());

    const previewId = urls[0]!.split("/").pop()!;
    const deleted = await app.handle(
      new Request(
        `http://localhost/api/softmods/${softmod.id}/previews/${previewId}`,
        { method: "DELETE", headers: { cookie: authorCookie } },
      ),
    );
    expect(deleted.status).toBe(200);

    const gone = await app.handle(new Request(`http://localhost${urls[0]}`));
    expect(gone.status).toBe(404);
  });

  test("scenes, clothes, and softmods expose the same content tag endpoints", async () => {
    const sceneBytes = await fixtureBytes("scene", "kk_scene_simple.png");
    const sceneForm = new FormData();
    sceneForm.append("semver", "1.0.0");
    sceneForm.append("gameId", gameId);
    sceneForm.append(
      "file",
      new File([sceneBytes], "kk_scene_simple.png", { type: "image/png" }),
    );
    const sceneRes = await app.handle(
      new Request("http://localhost/api/scenes", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: sceneForm,
      }),
    );
    expect(sceneRes.status).toBe(201);
    const scene = (await sceneRes.json()) as { id: string };

    const clothesBytes = await fixtureBytes("clothes", "kk_clothes.png");
    const clothesForm = new FormData();
    clothesForm.append("semver", "1.0.0");
    clothesForm.append("gameId", gameId);
    clothesForm.append(
      "file",
      new File([clothesBytes], "kk_clothes.png", { type: "image/png" }),
    );
    const clothesRes = await app.handle(
      new Request("http://localhost/api/clothes", {
        method: "POST",
        headers: { cookie: authorCookie },
        body: clothesForm,
      }),
    );
    expect(clothesRes.status).toBe(201);
    const outfit = (await clothesRes.json()) as { id: string };

    const softmod = await uploadSoftmod(authorCookie);

    for (const [path, name] of [
      [`/api/scenes/${scene.id}/tags`, "studio"],
      [`/api/clothes/${outfit.id}/tags`, "outfit"],
      [`/api/softmods/${softmod.id}/tags`, "mod"],
    ] as const) {
      const putRes = await app.handle(
        new Request(`http://localhost${path}`, {
          method: "PUT",
          headers: {
            cookie: authorCookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({ tags: [name] }),
        }),
      );
      expect(putRes.status).toBe(200);
      const got = await app.handle(new Request(`http://localhost${path}`));
      expect(got.status).toBe(200);
      const body = (await got.json()) as { tags: { name: string }[] };
      expect(body.tags.map((tag) => tag.name)).toEqual([name]);
    }
  });

  test("admin can edit another uploader's card description", async () => {
    const card = await uploadCard("kk_chara.png", authorCookie);
    const forbidden = await app.handle(
      new Request(`http://localhost/api/kk/cards/${card.id}`, {
        method: "PATCH",
        headers: {
          cookie: otherCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ description: "nope" }),
      }),
    );
    expect(forbidden.status).toBe(403);

    const patched = await app.handle(
      new Request(`http://localhost/api/kk/cards/${card.id}`, {
        method: "PATCH",
        headers: {
          cookie: adminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ description: "admin edit" }),
      }),
    );
    expect(patched.status).toBe(200);
    const body = (await patched.json()) as { description: string };
    expect(body.description).toBe("admin edit");
  });
});
