import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const MAX_EDGE = 512;
export const WEBP_QUALITY = 40;

export async function writeWebpPreview(
  sourcePngOrImageBytes: Uint8Array,
  destPath: string,
): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });

  // Copy out of parent ArrayBuffer views (card/scene payloads) so Bun.Image
  // never sees a subarray into a multi-megabyte containing buffer.
  const bytes =
    sourcePngOrImageBytes.byteOffset === 0 &&
    sourcePngOrImageBytes.byteLength === sourcePngOrImageBytes.buffer.byteLength
      ? sourcePngOrImageBytes
      : new Uint8Array(sourcePngOrImageBytes);

  const img = new Bun.Image(bytes);
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
