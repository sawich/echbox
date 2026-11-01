import { describe, expect, test } from "bun:test";
import { BinaryReader } from "../binary";
import { KoikatuCoordinateEntry } from "../chara/coordinate";
import { KoikatuCharaData, KoikatuCharaHeader } from "../chara/koikatu";
import { fixture, fixtureBytes } from "./helpers";

describe("KoikatuCharaData — reference samples", () => {
  test("loads kk_chara.png blocks and name", async () => {
    const kc = await KoikatuCharaData.load(fixture("chara", "kk_chara.png"));
    expect(kc.blockdata).toEqual([
      "Custom",
      "Coordinate",
      "Parameter",
      "Status",
    ]);
    expect(kc.blocks.Custom).toBeDefined();
    expect(kc.blocks.Parameter).toBeDefined();
    expect(kc.name.length).toBeGreaterThan(0);
    expect(kc.image?.byteLength).toBeGreaterThan(8);
    expect(kc.summary().header).toContain("KoiKatuChara");
  });

  test("loads from bytes without original path", async () => {
    const kc = await KoikatuCharaData.load(
      await fixtureBytes("chara", "kk_chara.png"),
    );
    expect(kc.originalFilePath).toBeNull();
    expect(kc.blockdata).toContain("Parameter");
  });

  test("loads mod character with KKEx", async () => {
    const kc = await KoikatuCharaData.load(fixture("chara", "kk_mod_chara.png"));
    expect(kc.blockdata).toContain("KKEx");
    expect(kc.summary().hasKkex).toBe(true);
  });

  test("header-only load", async () => {
    const header = await KoikatuCharaHeader.load(
      fixture("chara", "kk_chara.png"),
    );
    expect(header.productNo).toBe(100);
    expect(new TextDecoder().decode(header.header)).toContain("KoiKatuChara");
  });

  test("toJSON exposes block payloads", async () => {
    const kc = await KoikatuCharaData.load(fixture("chara", "kk_chara.png"));
    const json = kc.toJSON(false);
    expect(json.blockdata).toEqual(kc.blockdata);
    expect(json.Custom).toBeDefined();
    expect(json.Parameter).toBeDefined();
    expect(json.image).toBeUndefined();
  });
});

describe("KoikatuCharaData — ownCloud/Other cards", () => {
  test.each([
    ["kk_tatsumaki_fubuki.png", "KoiKatuChara"],
    ["kk_82127594.png", "KoiKatuChara"],
  ] as const)("loads %s", async (file, headerPart) => {
    const kc = await KoikatuCharaData.load(fixture("chara", file));
    expect(kc.summary().header).toContain(headerPart);
    expect(kc.blockdata).toContain("Custom");
    expect(kc.blockdata).toContain("Parameter");
    expect(kc.blockdata).toContain("Coordinate");
    expect(kc.name.length).toBeGreaterThan(0);
    expect(kc.image?.byteLength).toBeGreaterThan(1000);
  });

  test("Tatsumaki card includes KKEx mod block", async () => {
    const kc = await KoikatuCharaData.load(
      fixture("chara", "kk_tatsumaki_fubuki.png"),
    );
    expect(kc.summary().hasKkex).toBe(true);
    const parameter = kc.get("Parameter").data as Record<string, unknown>;
    expect(
      parameter.lastname != null ||
        parameter.firstname != null ||
        parameter.nickname != null ||
        parameter.fullname != null,
    ).toBe(true);
  });

  test("truncated Sunshine copy still yields header + core blocks", async () => {
    const raw = await fixtureBytes("chara", "kks_chara_truncated.png");
    const reader = new BinaryReader(raw);
    const png = reader.getPng();
    expect(png.byteLength).toBeGreaterThan(0);

    const productNo = reader.readI32();
    const header = new TextDecoder().decode(reader.loadLength("b"));
    const version = new TextDecoder().decode(reader.loadLength("b"));
    expect(productNo).toBe(100);
    expect(header).toContain("KoiKatuCharaSun");
    expect(version).toBe("0.0.0");

    // Full load: payload length exceeds file size (incomplete OwnCloud copy).
    const kc = await KoikatuCharaData.load(raw);
    expect(kc.summary().header).toContain("Sun");
    expect(kc.blockdata).toContain("Parameter");
    expect(kc.blockdata).toContain("About");
  });
});

describe("KoikatuCoordinateEntry — ownCloud/Other", () => {
  test("loads clothes card", async () => {
    const coord = await KoikatuCoordinateEntry.load(
      fixture("coordinate", "kk_coordinate.png"),
    );
    const summary = coord.summary();
    expect(summary.header).toContain("KoiKatuClothes");
    expect(summary.hasClothes).toBe(true);
    expect(summary.hasAccessory).toBe(true);
    expect(coord.data?.makeup).toBeDefined();
  });
});
