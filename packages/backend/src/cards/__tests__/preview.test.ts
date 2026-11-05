import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fixtureBytes } from "../../kkloader/__tests__/helpers";
import { WEBP_QUALITY, writeWebpPreview, writeWebpPreviewFit } from "../preview";

const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function png(width: number, height: number): Promise<Uint8Array> {
  return new Bun.Image(ONE_PX_PNG).resize(width, height).png().bytes();
}

describe("writeWebpPreview", () => {
  test("WEBP_QUALITY is 40 for gallery thumbnails", () => {
    expect(WEBP_QUALITY).toBe(40);
  });

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

  test("writeWebpPreview still caps the long edge at 512", async () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-preview-"));
    const dest = join(dir, "card.webp");
    try {
      await writeWebpPreview(await png(2000, 1500), dest);
      const meta = await new Bun.Image(await Bun.file(dest).bytes()).metadata();
      expect(meta.width).toBe(512);
      expect(meta.height).toBe(384);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("writeWebpPreviewFit", () => {
  test("shrinks a 2000x1500 image into 960x720 webp at quality 40", async () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-preview-fit-"));
    const dest = join(dir, "fit.webp");
    try {
      const source = await png(2000, 1500);
      await writeWebpPreviewFit(source, dest, {
        maxWidth: 1280,
        maxHeight: 720,
      });

      const out = new Uint8Array(await Bun.file(dest).arrayBuffer());
      expect(String.fromCharCode(...out.slice(0, 4))).toBe("RIFF");
      expect(String.fromCharCode(...out.slice(8, 12))).toBe("WEBP");

      const meta = await new Bun.Image(out).metadata();
      expect(meta.width).toBe(960);
      expect(meta.height).toBe(720);

      const expected = await new Bun.Image(source)
        .resize(960, 720)
        .webp({ quality: 40 })
        .bytes();
      expect(Buffer.from(out).equals(Buffer.from(expected))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("caps a wide image on width inside the same box", async () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-preview-fit-"));
    const dest = join(dir, "wide.webp");
    try {
      await writeWebpPreviewFit(await png(2560, 400), dest, {
        maxWidth: 1280,
        maxHeight: 720,
      });
      const meta = await new Bun.Image(await Bun.file(dest).bytes()).metadata();
      expect(meta.width).toBe(1280);
      expect(meta.height).toBe(200);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not enlarge an image that already fits", async () => {
    const dir = mkdtempSync(join(tmpdir(), "echbox-preview-fit-"));
    const dest = join(dir, "small.webp");
    try {
      await writeWebpPreviewFit(await png(640, 360), dest, {
        maxWidth: 1280,
        maxHeight: 720,
      });
      const meta = await new Bun.Image(await Bun.file(dest).bytes()).metadata();
      expect(meta.width).toBe(640);
      expect(meta.height).toBe(360);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
