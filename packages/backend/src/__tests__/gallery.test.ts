import { describe, expect, test } from "bun:test";
import { app } from "../app";
import { createGalleryService } from "../gallery/service";

describe("gallery service", () => {
  test("listCards includes multi-version sample with latestVersion 2", async () => {
    const svc = createGalleryService();
    const cards = await svc.listCards();
    const sample = cards.find((c) => c.id === "chara-sample");
    expect(sample).toBeDefined();
    expect(sample!.latestVersion).toBe(2);
    expect(sample!.versionCount).toBe(2);
    expect(sample!.imageUrl).toBe(
      "/api/kk/cards/chara-sample/versions/2/image",
    );
    expect(sample!.title.length).toBeGreaterThan(0);
  });

  test("listCards filters by type=scene", async () => {
    const svc = createGalleryService();
    const scenes = await svc.listCards("scene");
    expect(scenes.length).toBeGreaterThan(0);
    expect(scenes.every((c) => c.type === "scene")).toBe(true);
  });

  test("getCard returns all versions for chara-sample", async () => {
    const svc = createGalleryService();
    const card = await svc.getCard("chara-sample");
    expect(card).not.toBeNull();
    expect(card!.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(card!.versions[1]!.notes).toContain("KKEx");
  });

  test("getVersionImage returns png bytes for latest sample", async () => {
    const svc = createGalleryService();
    const bytes = await svc.getVersionImage("chara-sample", 2);
    expect(bytes).not.toBeNull();
    expect(bytes!.byteLength).toBeGreaterThan(8);
    expect(bytes![0]).toBe(0x89);
    expect(bytes![1]).toBe(0x50);
  });

  test("getCard unknown id returns null", async () => {
    const svc = createGalleryService();
    expect(await svc.getCard("nope")).toBeNull();
  });
});

describe("GET /api/kk/cards", () => {
  test("GET /api/kk/cards returns seeded cards", async () => {
    const res = await app.handle(new Request("http://localhost/api/kk/cards"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: { id: string }[] };
    expect(body.cards.some((c) => c.id === "chara-sample")).toBe(true);
  });

  test("GET /api/kk/cards?type=character excludes scenes", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards?type=character"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: { type: string }[] };
    expect(body.cards.every((c) => c.type === "character")).toBe(true);
  });

  test("GET /api/kk/cards/chara-sample returns versions", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards/chara-sample"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { versions: unknown[] };
    expect(body.versions).toHaveLength(2);
  });

  test("GET missing card is 404", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/kk/cards/does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  test("GET version image is png", async () => {
    const res = await app.handle(
      new Request(
        "http://localhost/api/kk/cards/chara-sample/versions/2/image",
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf[0]).toBe(0x89);
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
        "http://localhost/api/kk/cards/chara-sample/versions/999/image",
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
