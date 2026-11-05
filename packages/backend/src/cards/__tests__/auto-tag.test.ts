import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import {
  characterCards,
  characterCardVersions,
  games,
  users,
} from "../../db/schema";
import {
  createTag,
  getContentTags,
  setContentTags,
  type TagActor,
} from "../../tags/service";
import {
  autoTagCards,
  buildTaggerWorkflow,
  extractTagStringFromHistory,
  parseBooruTagString,
  type ComfyClient,
  type HistoryEntry,
} from "../auto-tag";

describe("parseBooruTagString", () => {
  test("parseBooruTagString splits and drops empties", () => {
    expect(parseBooruTagString("1girl, blue_hair, long_hair,")).toEqual([
      "1girl",
      "blue_hair",
      "long_hair",
    ]);
  });
});

describe("buildTaggerWorkflow", () => {
  test("buildTaggerWorkflow sets LoadImage filename", () => {
    const wf = buildTaggerWorkflow(
      { "2": { inputs: { image: "old.jpg" }, class_type: "LoadImage" } },
      "card.webp",
    );
    expect((wf["2"] as { inputs: { image: string } }).inputs.image).toBe(
      "card.webp",
    );
  });
});

describe("extractTagStringFromHistory", () => {
  test("extractTagStringFromHistory reads node 8 text", () => {
    expect(
      extractTagStringFromHistory({
        outputs: { "8": { text: ["1girl, blue_hair"] } },
      }),
    ).toBe("1girl, blue_hair");
  });
});

describe("autoTagCards", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let uploader: TagActor;
  const workflow = {
    "2": { inputs: { image: "old.jpg" }, class_type: "LoadImage" },
  };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-auto-tag-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    mkdirSync(dataDir, { recursive: true });
    migrateDb(dbPath);
    uploader = insertUser("uploader");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function insertUser(username: string): TagActor {
    const userId = crypto.randomUUID();
    getDb(dbPath)
      .insert(users)
      .values({
        id: userId,
        discordId: `discord-${username}-${userId}`,
        username,
        avatar: null,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { userId, isAdmin: false };
  }

  function seedCardWithPreview(opts?: {
    previewExists?: boolean;
  }): { cardId: string; previewPath: string } {
    const db = getDb(dbPath);
    const now = new Date().toISOString();
    const gameId = crypto.randomUUID();
    db.insert(games)
      .values({
        id: gameId,
        slug: `game-${gameId}`,
        title: "Test game",
        description: null,
        createdByUserId: uploader.userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const cardId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const previewPath = join(dataDir, "cards", cardId, versionId, "preview.webp");
    mkdirSync(join(dataDir, "cards", cardId, versionId), { recursive: true });
    if (opts?.previewExists !== false) {
      writeFileSync(previewPath, "fake-webp");
    }
    db.insert(characterCards)
      .values({
        id: cardId,
        gameId,
        uploaderId: uploader.userId,
        description: "",
        latestSemver: "1.0.0",
        latestVersionId: versionId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(characterCardVersions)
      .values({
        id: versionId,
        cardId,
        semver: "1.0.0",
        notes: null,
        contentHash: `hash-${versionId}`,
        originalPath: null,
        previewPath,
        summaryJson: "{}",
        createdAt: now,
      })
      .run();
    return { cardId, previewPath };
  }

  function fakeComfy(historyText: string): ComfyClient & {
    uploadCalls: string[];
  } {
    const uploadCalls: string[] = [];
    return {
      uploadCalls,
      async uploadImage(path: string) {
        uploadCalls.push(path);
        return "uploaded.webp";
      },
      async runWorkflow(): Promise<HistoryEntry> {
        return { outputs: { "8": { text: [historyText] } } };
      },
    };
  }

  test("autoTagCards skips already-tagged cards without calling Comfy", async () => {
    const { cardId } = seedCardWithPreview();
    createTag({
      name: "existing",
      category: "general",
      actor: uploader,
      dbPath,
    });
    setContentTags({
      kind: "cards",
      contentId: cardId,
      names: ["existing"],
      actor: uploader,
      uploaderId: uploader.userId,
      dbPath,
    });

    const comfy: ComfyClient = {
      async uploadImage() {
        throw new Error("Comfy should not be called");
      },
      async runWorkflow() {
        throw new Error("Comfy should not be called");
      },
    };

    const result = await autoTagCards({
      dbPath,
      dataDir,
      comfy,
      workflow,
      userId: uploader.userId,
    });

    expect(result).toEqual({
      tagged: 0,
      skipped: 1,
      failed: 0,
      failures: [],
    });
  });

  test("autoTagCards ensure+set on untagged card", async () => {
    const { cardId, previewPath } = seedCardWithPreview();
    const comfy = fakeComfy("1girl, blue_hair");

    const result = await autoTagCards({
      dbPath,
      dataDir,
      comfy,
      workflow,
      userId: uploader.userId,
    });

    expect(result.tagged).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(comfy.uploadCalls).toEqual([previewPath]);
    expect(
      getContentTags({ kind: "cards", contentId: cardId, dbPath }).map(
        (t) => t.name,
      ),
    ).toEqual(["1girl", "blue_hair"]);
  });

  test("autoTagCards dryRun does not write content_tags", async () => {
    const { cardId } = seedCardWithPreview();
    const comfy = fakeComfy("1girl, blue_hair");

    const result = await autoTagCards({
      dbPath,
      dataDir,
      comfy,
      workflow,
      dryRun: true,
      userId: uploader.userId,
    });

    expect(result.tagged).toBe(1);
    expect(
      getContentTags({ kind: "cards", contentId: cardId, dbPath }),
    ).toEqual([]);
  });
});
