import { describe, expect, test } from "bun:test";
import { strToU8, unzipSync, zipSync } from "fflate";
import { fixtureBytes } from "../../kkloader/__tests__/helpers";
import { parseSoftmodManifest } from "../manifest";

const validManifest = `<?xml version="1.0"?>
<Manifest>
  <guid>com.echbox.testmod</guid>
  <name>Test Mod</name>
  <version>1.2.3</version>
  <author>Tester</author>
</Manifest>`;

function zipWithManifest(
  manifestXml: string,
  entryName = "manifest.xml",
): Uint8Array {
  return zipSync({ [entryName]: strToU8(manifestXml) });
}

test("parseSoftmodManifest reads Sideloader fields", async () => {
  const bytes = await fixtureBytes("softmods", "testmod.zipmod");
  const m = parseSoftmodManifest(bytes);
  expect(m.guid).toBe("com.echbox.testmod");
  expect(m.name).toBe("Test Mod");
  expect(m.version).toBe("1.2.3");
  expect(m.author).toBe("Tester");
});

test("parseSoftmodManifest rejects missing guid", () => {
  const bytes = zipWithManifest(`<?xml version="1.0"?>
<Manifest>
  <name>No Guid Mod</name>
  <version>1.0.0</version>
</Manifest>`);
  expect(() => parseSoftmodManifest(bytes)).toThrow(/guid/i);
});

test("parseSoftmodManifest rejects missing manifest.xml", () => {
  const bytes = zipSync({ "readme.txt": strToU8("hello") });
  expect(() => parseSoftmodManifest(bytes)).toThrow(/manifest\.xml/i);
});

test("parseSoftmodManifest rejects wrong-case Manifest.xml", () => {
  const bytes = zipSync({ "Manifest.xml": strToU8(validManifest) });
  expect(() => parseSoftmodManifest(bytes)).toThrow(/manifest\.xml/i);
});

test("parseSoftmodManifest rejects empty guid tag", () => {
  const bytes = zipWithManifest(`<?xml version="1.0"?>
<Manifest>
  <guid></guid>
  <name>No Guid Mod</name>
</Manifest>`);
  expect(() => parseSoftmodManifest(bytes)).toThrow(/guid/i);
});

test("parseSoftmodManifest rejects whitespace-only guid", () => {
  const bytes = zipWithManifest(`<?xml version="1.0"?>
<Manifest>
  <guid>   </guid>
  <name>No Guid Mod</name>
</Manifest>`);
  expect(() => parseSoftmodManifest(bytes)).toThrow(/guid/i);
});

test("parseSoftmodManifest reads ./manifest.xml entry", () => {
  const bytes = zipWithManifest(validManifest, "./manifest.xml");
  const m = parseSoftmodManifest(bytes);
  expect(m.guid).toBe("com.echbox.testmod");
  expect(m.name).toBe("Test Mod");
});

describe("parseSoftmodManifest guid allowlist (C1)", () => {
  const hostile = [
    "..",
    ".",
    "../..",
    "../../../tmp/x",
    "a/b",
    "a\\b",
    "/etc/passwd",
    "foo..bar",
    ".hidden",
    "-leading-dash",
    "has space",
    "x".repeat(129),
  ];

  for (const guid of hostile) {
    test(`rejects hostile guid ${JSON.stringify(guid.slice(0, 20))}`, () => {
      const bytes = zipWithManifest(validManifest.replace("com.echbox.testmod", guid));
      expect(() => parseSoftmodManifest(bytes)).toThrow(/guid/i);
    });
  }

  for (const guid of ["com.echbox.testmod", "Mod_Name-1.0", "a", "9lives"]) {
    test(`accepts Sideloader-style guid ${guid}`, () => {
      const bytes = zipWithManifest(validManifest.replace("com.echbox.testmod", guid));
      expect(parseSoftmodManifest(bytes).guid).toBe(guid);
    });
  }
});

describe("parseSoftmodManifest only inflates manifest.xml (I3)", () => {
  function zipWithCorruptBomb(): Uint8Array {
    const bytes = zipSync({
      "bomb.bin": new Uint8Array(2 * 1024 * 1024),
      "manifest.xml": strToU8(validManifest),
    });
    // Local header (30) + name length (8) => start of the deflate stream.
    for (let i = 38; i < 48; i++) bytes[i] = 0xff;
    return bytes;
  }

  test("corrupt unrelated entry is never inflated", () => {
    const bytes = zipWithCorruptBomb();
    // Sanity: inflating every entry would fail on this archive.
    expect(() => unzipSync(bytes)).toThrow();
    expect(parseSoftmodManifest(bytes).guid).toBe("com.echbox.testmod");
  });

  test("rejects an oversized manifest.xml without inflating it", () => {
    const huge = `<guid>x</guid>${" ".repeat(2 * 1024 * 1024)}`;
    const bytes = zipWithManifest(huge);
    expect(() => parseSoftmodManifest(bytes)).toThrow(/too large/i);
  });
});
