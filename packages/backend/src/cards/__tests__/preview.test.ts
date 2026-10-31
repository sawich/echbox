import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fixtureBytes } from "../../kkloader/__tests__/helpers";
import { writeWebpPreview } from "../preview";

describe("writeWebpPreview", () => {
  test("writeWebpPreview writes webp magic", async () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-preview-"));
    const dest = join(dir, "nested", "preview.webp");
    try {
      const source = await fixtureBytes("chara", "kk_chara.png");
      await writeWebpPreview(source, dest);

      const out = new Uint8Array(await Bun.file(dest).arrayBuffer());
      expect(out.length).toBeGreaterThan(12);
      expect(String.fromCharCode(...out.slice(0, 4))).toBe("RIFF");
      expect(String.fromCharCode(...out.slice(8, 12))).toBe("WEBP");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
