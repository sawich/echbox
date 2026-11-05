import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const MAX_EDGE = 512;
export const WEBP_QUALITY = 40;

export type WebpPreviewFit = {
  maxWidth: number;
  maxHeight: number;
};

function standaloneImageBytes(source: Uint8Array): Uint8Array {
  // Copy out of parent ArrayBuffer views (card/scene payloads) so Bun.Image
  // never sees a subarray into a multi-megabyte containing buffer.
  return source.byteOffset === 0 &&
    source.byteLength === source.buffer.byteLength
    ? source
    : new Uint8Array(source);
}

export async function writeWebpPreview(
  sourcePngOrImageBytes: Uint8Array,
  destPath: string,
): Promise<void> {
  await writeWebpPreviewFit(sourcePngOrImageBytes, destPath, {
    maxWidth: MAX_EDGE,
    maxHeight: MAX_EDGE,
  });
}

export async function writeWebpPreviewFit(
  sourcePngOrImageBytes: Uint8Array,
  destPath: string,
  fit: WebpPreviewFit,
): Promise<void> {
  if (
    !Number.isFinite(fit.maxWidth) ||
    !Number.isFinite(fit.maxHeight) ||
    fit.maxWidth < 1 ||
    fit.maxHeight < 1
  ) {
    throw new Error("Preview fit box must be at least 1x1");
  }

  await mkdir(dirname(destPath), { recursive: true });

  const img = new Bun.Image(standaloneImageBytes(sourcePngOrImageBytes));
  await img.metadata();

  const scale = Math.min(1, fit.maxWidth / img.width, fit.maxHeight / img.height);
  let width = img.width;
  let height = img.height;
  if (scale < 1) {
    width = Math.max(1, Math.round(img.width * scale));
    height = Math.max(1, Math.round(img.height * scale));
    if (width > fit.maxWidth) width = fit.maxWidth;
    if (height > fit.maxHeight) height = fit.maxHeight;
  }

  const pipeline =
    width === img.width && height === img.height ? img : img.resize(width, height);

  await pipeline.webp({ quality: WEBP_QUALITY }).write(destPath);
}
