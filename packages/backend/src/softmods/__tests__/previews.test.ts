import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { eq } from "drizzle-orm";
import { seedTestGame } from "../../__tests__/test-game";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { softmodPreviews, users } from "../../db/schema";
import { createSoftmod, deleteSoftmod, getSoftmod, listSoftmods } from "../service";
import {
  addSoftmodPreview,
  deleteSoftmodPreview,
  listSoftmodPreviews,
  reorderSoftmodPreviews,
} from "../previews";

const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function png(width: number, height: number): Promise<Uint8Array> {
  return new Bun.Image(ONE_PX_PNG).resize(width, height).png().bytes();
}

function zipmod(guid: string): Uint8Array {
  return zipSync({
    "manifest.xml": strToU8(
      `<?xml version="1.0"?><Manifest><guid>${guid}</guid><name>N</name><version>1.0.0</version><author>A</author><description>d</description></Manifest>`,
    ),
    "data.txt": strToU8("payload"),
  });
}

describe("softmod previews", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let otherUserId: string;
  let gameId: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-softmod-previews-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;
    migrateDb(dbPath);

    authorId = crypto.randomUUID();
    otherUserId = crypto.randomUUID();
    const now = new Date().toISOString();
    getDb(dbPath)
      .insert(users)
      .values([
        {
          id: authorId,
          discordId: "discord-preview-author",
          username: "preview_author",
          avatar: null,
          createdAt: now,
        },
        {
          id: otherUserId,
          discordId: "discord-preview-other",
          username: "preview_other",
          avatar: null,
          createdAt: now,
        },
      ])
      .run();
    gameId = seedTestGame(authorId, { dbPath }).id;
  });

  afterEach(() => {
    delete process.env.DATABASE_PATH;
    delete process.env.DATA_DIR;
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("accepts three previews and rejects a fourth", async () => {
    const softmod = await createSoftmod({
      gameId,
      uploaderId: authorId,
      semver: "1.0.0",
      fileBytes: zipmod("com.echbox.previews"),
      dbPath,
      dataDir,
    });
    const actor = { userId: authorId, isAdmin: false };
    const bytes = await png(32, 32);

    const added = [];
    for (let i = 0; i < 3; i++) {
      added.push(
        await addSoftmodPreview({
          softmodId: softmod.id,
          bytes,
          actor,
          uploaderId: authorId,
          dbPath,
          dataDir,
        }),
      );
    }

    let rejected: unknown;
    try {
      await addSoftmodPreview({
        softmodId: softmod.id,
        bytes,
        actor,
        uploaderId: authorId,
        dbPath,
        dataDir,
      });
    } catch (err) {
      rejected = err;
    }

    expect((rejected as { status: number }).status).toBe(400);
    const listed = listSoftmodPreviews(softmod.id, { dbPath });
    expect(listed).toHaveLength(3);
    expect(listed.map((preview) => preview.url)).toEqual(
      added.map((preview) => preview.url),
    );
    expect(listed.map((preview) => preview.url)).toEqual([
      `/api/softmods/${softmod.id}/previews/${added[0]!.id}`,
      `/api/softmods/${softmod.id}/previews/${added[1]!.id}`,
      `/api/softmods/${softmod.id}/previews/${added[2]!.id}`,
    ]);
  });

  test("stores an oversized preview as webp fitted inside 1280x720", async () => {
    const softmod = await createSoftmod({
      gameId,
      uploaderId: authorId,
      semver: "1.0.0",
      fileBytes: zipmod("com.echbox.preview-fit"),
      dbPath,
      dataDir,
    });
    const source = await png(2000, 1500);
    const added = await addSoftmodPreview({
      softmodId: softmod.id,
      bytes: source,
      actor: { userId: authorId, isAdmin: false },
      uploaderId: authorId,
      dbPath,
      dataDir,
    });

    const row = getDb(dbPath)
      .select()
      .from(softmodPreviews)
      .where(eq(softmodPreviews.id, added.id))
      .get();
    expect(row?.previewPath).toBeTruthy();
    const stored = new Uint8Array(await Bun.file(row!.previewPath).arrayBuffer());
    expect(String.fromCharCode(...stored.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...stored.slice(8, 12))).toBe("WEBP");
    const meta = await new Bun.Image(stored).metadata();
    expect(meta.width).toBe(960);
    expect(meta.height).toBe(720);

    const detail = await getSoftmod(softmod.id, { dbPath, dataDir });
    const list = await listSoftmods({ dbPath, dataDir });
    expect(detail?.previewUrls).toEqual([added.url]);
    expect(list.items[0]?.previewUrls).toEqual([added.url]);
  });

  test("deleteSoftmod removes preview rows and files", async () => {
    const softmod = await createSoftmod({
      gameId,
      uploaderId: authorId,
      semver: "1.0.0",
      fileBytes: zipmod("com.echbox.preview-delete"),
      dbPath,
      dataDir,
    });
    await addSoftmodPreview({
      softmodId: softmod.id,
      bytes: await png(16, 16),
      actor: { userId: authorId, isAdmin: false },
      uploaderId: authorId,
      dbPath,
      dataDir,
    });

    const db = getDb(dbPath);
    const rows = db
      .select()
      .from(softmodPreviews)
      .where(eq(softmodPreviews.softmodId, softmod.id))
      .all();
    expect(rows).toHaveLength(1);
    expect(existsSync(rows[0]!.previewPath)).toBe(true);

    await deleteSoftmod({
      softmodId: softmod.id,
      uploaderId: authorId,
      dbPath,
      dataDir,
    });

    expect(
      db
        .select()
        .from(softmodPreviews)
        .where(eq(softmodPreviews.softmodId, softmod.id))
        .all(),
    ).toHaveLength(0);
    expect(existsSync(rows[0]!.previewPath)).toBe(false);
  });

  test("rejects bytes that are not an image", async () => {
    const softmod = await createSoftmod({
      gameId,
      uploaderId: authorId,
      semver: "1.0.0",
      fileBytes: zipmod("com.echbox.preview-bad"),
      dbPath,
      dataDir,
    });

    let rejected: unknown;
    try {
      await addSoftmodPreview({
        softmodId: softmod.id,
        bytes: new Uint8Array([1, 2, 3, 4]),
        actor: { userId: authorId, isAdmin: false },
        uploaderId: authorId,
        dbPath,
        dataDir,
      });
    } catch (err) {
      rejected = err;
    }

    expect((rejected as { status: number }).status).toBe(400);
    expect(listSoftmodPreviews(softmod.id, { dbPath })).toHaveLength(0);
  });

  test("rejects a preview from someone other than the uploader", async () => {
    const softmod = await createSoftmod({
      gameId,
      uploaderId: authorId,
      semver: "1.0.0",
      fileBytes: zipmod("com.echbox.preview-auth"),
      dbPath,
      dataDir,
    });

    let rejected: unknown;
    try {
      await addSoftmodPreview({
        softmodId: softmod.id,
        bytes: await png(8, 8),
        actor: { userId: otherUserId, isAdmin: false },
        uploaderId: authorId,
        dbPath,
        dataDir,
      });
    } catch (err) {
      rejected = err;
    }

    expect((rejected as { status: number }).status).toBe(403);
    expect(listSoftmodPreviews(softmod.id, { dbPath })).toHaveLength(0);
  });

  test("admin can add a preview for another uploader", async () => {
    const softmod = await createSoftmod({
      gameId,
      uploaderId: authorId,
      semver: "1.0.0",
      fileBytes: zipmod("com.echbox.preview-admin"),
      dbPath,
      dataDir,
    });

    const added = await addSoftmodPreview({
      softmodId: softmod.id,
      bytes: await png(8, 8),
      actor: { userId: otherUserId, isAdmin: true },
      uploaderId: authorId,
      dbPath,
      dataDir,
    });

    expect(listSoftmodPreviews(softmod.id, { dbPath }).map((p) => p.id)).toEqual([
      added.id,
    ]);
  });

  test("deleteSoftmodPreview removes that image and keeps the others in order", async () => {
    const softmod = await createSoftmod({
      gameId,
      uploaderId: authorId,
      semver: "1.0.0",
      fileBytes: zipmod("com.echbox.preview-one"),
      dbPath,
      dataDir,
    });
    const actor = { userId: authorId, isAdmin: false };
    const bytes = await png(8, 8);
    const first = await addSoftmodPreview({
      softmodId: softmod.id,
      bytes,
      actor,
      uploaderId: authorId,
      dbPath,
      dataDir,
    });
    const second = await addSoftmodPreview({
      softmodId: softmod.id,
      bytes,
      actor,
      uploaderId: authorId,
      dbPath,
      dataDir,
    });
    const file = getDb(dbPath)
      .select()
      .from(softmodPreviews)
      .where(eq(softmodPreviews.id, first.id))
      .get()!.previewPath;

    await deleteSoftmodPreview({
      softmodId: softmod.id,
      previewId: first.id,
      actor,
      uploaderId: authorId,
      dbPath,
      dataDir,
    });

    expect(existsSync(file)).toBe(false);
    expect(listSoftmodPreviews(softmod.id, { dbPath }).map((p) => p.id)).toEqual([
      second.id,
    ]);
    const detail = await getSoftmod(softmod.id, { dbPath, dataDir });
    expect(detail?.previewUrls).toEqual([second.url]);
  });

  test("reorderSoftmodPreviews changes list and detail url order", async () => {
    const softmod = await createSoftmod({
      gameId,
      uploaderId: authorId,
      semver: "1.0.0",
      fileBytes: zipmod("com.echbox.preview-order"),
      dbPath,
      dataDir,
    });
    const actor = { userId: authorId, isAdmin: false };
    const bytes = await png(8, 8);
    const ids = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        (
          await addSoftmodPreview({
            softmodId: softmod.id,
            bytes,
            actor,
            uploaderId: authorId,
            dbPath,
            dataDir,
          })
        ).id,
      );
    }

    const orderedIds = [ids[2]!, ids[0]!, ids[1]!];
    await reorderSoftmodPreviews({
      softmodId: softmod.id,
      orderedIds,
      actor,
      uploaderId: authorId,
      dbPath,
      dataDir,
    });

    expect(listSoftmodPreviews(softmod.id, { dbPath }).map((p) => p.id)).toEqual(
      orderedIds,
    );
    const detail = await getSoftmod(softmod.id, { dbPath, dataDir });
    expect(detail?.previewUrls).toEqual(
      orderedIds.map((id) => `/api/softmods/${softmod.id}/previews/${id}`),
    );
  });
});
