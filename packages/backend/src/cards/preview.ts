import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const MAX_EDGE = 512;
const WEBP_QUALITY = 80;

export async function writeWebpPreview(
  sourcePngOrImageBytes: Uint8Array,
  destPath: string,
): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });

  const img = new Bun.Image(sourcePngOrImageBytes);
  await img.metadata();

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const pipeline =
    scale < 1
      ? img.resize(
          Math.round(img.width * scale),
          Math.round(img.height * scale),
        )
      : img;

  await pipeline.webp({ quality: WEBP_QUALITY }).write(destPath);
}
