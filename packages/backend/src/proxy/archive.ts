import { unzipSync, zipSync } from "fflate";

export const CHUNK_SIZE_BYTES = 19 * 1024 * 1024;

const CONTENT_ENTRY = "content";

export function packOriginal(original: Uint8Array): Uint8Array {
  return zipSync({ [CONTENT_ENTRY]: original }, { level: 9 });
}

export function splitChunks(
  archive: Uint8Array,
  chunkSize = CHUNK_SIZE_BYTES,
): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < archive.length; offset += chunkSize) {
    chunks.push(archive.subarray(offset, offset + chunkSize));
  }
  return chunks;
}

export function unpackOriginal(archive: Uint8Array): Uint8Array {
  const entries = unzipSync(archive);
  const content = entries[CONTENT_ENTRY];
  if (!content) {
    throw new Error(`Zip archive missing "${CONTENT_ENTRY}" entry`);
  }
  return content;
}
