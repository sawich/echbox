import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../app";
import { migrateDb } from "../db/migrate";
import { createGalleryService } from "../gallery/service";

describe("gallery service (scenes)", () => {
  test("listCards returns seeded scenes only", async () => {
    const svc = createGalleryService();
    const cards = await svc.listCards();
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.type === "scene")).toBe(true);
    const sample = cards.find((c) => c.id === "scene-simple");
    expect(sample).toBeDefined();
    expect(sample!.latestVersion).toBe(1);
    expect(sample!.versionCount).toBe(1);
    expect(sample!.imageUrl).toBe(
      "/api/kk/cards/scene-simple/versions/1/image",
    );
    expect(sample!.title.length).toBeGreaterThan(0);
  });

  test("listCards filters by type=scene", async () => {
    const svc = createGalleryService();
    const scenes = await svc.listCards("scene");
    expect(scenes.length).toBeGreaterThan(0);
    expect(scenes.every((c) => c.type === "scene")).toBe(true);
  });

  test("getCard returns versions for scene-simple", async () => {
    const svc = createGalleryService();
    const card = await svc.getCard("scene-simple");
    expect(card).not.toBeNull();
    expect(card!.type).toBe("scene");
    expect(card!.versions.map((v) => v.version)).toEqual([1]);
  });

  test("getVersionImage returns png bytes for scene-simple", async () => {
    const svc = createGalleryService();
    const bytes = await svc.getVersionImage("scene-simple", 1);
    expect(bytes).not.toBeNull();
    expect(bytes!.byteLength).toBeGreaterThan(8);
    expect(bytes![0]).toBe(0x89);
    expect(bytes![1]).toBe(0x50);
  });

  test("getCard unknown id returns null", async () => {
    const svc = createGalleryService();
    expect(await svc.getCard("nope")).toBeNull();
    expect(await svc.getCard("chara-sample")).toBeNull();
  });
});

describe("GET /api/kk/cards", () => {
  let tempDir: string;
  let dbPath: string;
  const origDbPath = process.env.DATABASE_PATH;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-gallery-"));
    dbPath = join(tempDir, "test.db");
    process.env.DATABASE_PATH = dbPath;
    Bun.env.DATABASE_PATH = dbPath;
    migrateDb(dbPath);
  });

  afterEach(() => {
    if (origDbPath === undefined) {
      delete process.env.DATABASE_PATH;
      delete Bun.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = origDbPath;
      Bun.env.DATABASE_PATH = origDbPath;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("GET /api/kk/cards returns DB characters only (no fixture scenes)", async () => {
    const res = await app.handle(new Request("http://localhost/api/kk/cards"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: { id: string; type?: string }[] };
    expect(body.cards).toEqual([]);
  });

  test("GET /api/kk/cards?type=scene returns empty cards", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards?type=scene"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: unknown[] };
    expect(body.cards).toEqual([]);
  });

  test("GET /api/kk/cards?type=character returns DB characters (empty on fresh DB)", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards?type=character"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: { type: string }[] };
    expect(body.cards).toEqual([]);
  });

  test("GET /api/kk/cards/scene-simple is 404 after scene cutover", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards/scene-simple"),
    );
    expect(res.status).toBe(404);
  });

  test("GET missing card is 404", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards/does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  test("GET fixture scene image via kk/cards is 404 after cutover", async () => {
    const res = await app.handle(
      new Request(
        "http://localhost/api/kk/cards/scene-simple/versions/1/image",
      ),
    );
    expect(res.status).toBe(404);
  });

  test("GET invalid type query is rejected", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards?type=invalid"),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("GET unknown version image is 404", async () => {
    const res = await app.handle(
      new Request(
        "http://localhost/api/kk/cards/scene-simple/versions/999/image",
      ),
    );
    expect(res.status).toBe(404);
  });
});

describe("gallery seed fixtures", () => {
  test("resolveFixture throws with path for missing file", async () => {
    const { resolveFixture } = await import("../gallery/seed");
    expect(() => resolveFixture("chara/does-not-exist.png")).toThrow(
      /Missing gallery fixture/,
    );
  });
});
