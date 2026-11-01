import { describe, expect, test } from "bun:test";
import { KoikatuCharaData } from "../chara/koikatu";
import { KoikatuSceneData } from "../scene/koikatu";
import { fixture, fixtureBytes } from "./helpers";

describe("KoikatuSceneData.load", () => {
  test("loads simple scene", async () => {
    const scene = await KoikatuSceneData.load(
      fixture("scene", "kk_scene_simple.png"),
    );
    expect(scene.version).toBe("1.1.2.1");
    expect(Object.keys(scene.objects)).toHaveLength(1);
    const obj = Object.values(scene.objects)[0]!;
    expect(obj.type).toBe(1);
    expect(obj.data.group).toBeDefined();
    expect(obj.data.category).toBeDefined();
    expect(obj.data.no).toBeDefined();
    expect(obj.data.colors).toBeDefined();
    expect(obj.data.patterns).toBeDefined();
    expect(obj.data.panel).toBeDefined();
    expect(scene.tail).toBe("【KStudio】");
  });

  test("loads from bytes without filename", async () => {
    const scene = await KoikatuSceneData.load(
      await fixtureBytes("scene", "kk_scene_simple.png"),
    );
    expect(scene.originalFilename).toBeNull();
  });

  test("loads kk_scene.png object counts", async () => {
    const scene = await KoikatuSceneData.load(fixture("scene", "kk_scene.png"));
    expect(scene.version).toBe("1.0.4.2");
    const counts = scene.countObjectTypes();
    expect(counts.Character).toBe(1);
    expect(counts.Item).toBe(169);
    expect(counts.Folder).toBe(19);
  });

  test("loads mod scene", async () => {
    const scene = await KoikatuSceneData.load(
      fixture("scene", "kk_scene_mod.png"),
    );
    expect(scene.summary().hasMod).toBe(true);
    const counts = scene.countObjectTypes();
    expect(counts.Character).toBe(1);
    expect(counts.Item).toBe(202);
    expect(counts.Light).toBe(1);
    expect(counts.Folder).toBe(202);
  });

  test("loads Sunshine scene", async () => {
    const scene = await KoikatuSceneData.load(fixture("scene", "kks_scene.png"));
    expect(scene.version).toBeTruthy();
    expect(scene.tail).toBe("【KStudio】");
    expect(Object.keys(scene.objects).length).toBeGreaterThan(0);
    expect(scene.summary().objectTypes).toBeDefined();
  });

  test("summary and toJSON are stable", async () => {
    const scene = await KoikatuSceneData.load(
      fixture("scene", "kk_scene_simple.png"),
    );
    const summary = scene.summary();
    expect(summary.version).toBe(scene.version);
    expect(summary.objectCount).toBe(1);
    expect(summary.hasMod).toBe(false);

    const json = scene.toJSON();
    expect(json.objectCount).toBe(1);
    expect(json.objects).toBeDefined();
  });

  test("embedded character in scene loads as KoikatuCharaData", async () => {
    const scene = await KoikatuSceneData.load(fixture("scene", "kk_scene.png"));
    let character: { type: number; data: Record<string, unknown> } | undefined;
    for (const entry of scene.walk()) {
      const obj = entry[1];
      if (obj.type === 0) {
        character = obj;
        break;
      }
    }
    expect(character).toBeDefined();
    const embedded = character!.data.character;
    expect(embedded).toBeInstanceOf(KoikatuCharaData);
    expect((embedded as KoikatuCharaData).blockdata.length).toBeGreaterThan(0);
  });

  test("ownCloud Other incomplete scene starts with studio version", async () => {
    const raw = await fixtureBytes("scene", "kk_scene_2023_1204.png");
    const { BinaryReader } = await import("../binary");
    const reader = new BinaryReader(raw);
    reader.getPng();
    // Scene payload begins with 7-bit length-prefixed version string (e.g. 1.0.4.2).
    const version = reader.loadUtf8String();
    expect(version).toMatch(/^\d+\.\d+/);
  });
});
