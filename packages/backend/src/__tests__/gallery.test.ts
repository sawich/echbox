import { describe, expect, test } from "bun:test";
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
