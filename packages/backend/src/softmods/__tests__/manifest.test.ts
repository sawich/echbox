import { expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
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
