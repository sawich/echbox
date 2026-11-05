import { describe, expect, test } from "bun:test";
import {
  buildTaggerWorkflow,
  extractTagStringFromHistory,
  parseBooruTagString,
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
