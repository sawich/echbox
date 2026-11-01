import { unzipSync } from "fflate";

const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];

/**
 * Validates that bytes are a non-empty zip with at least one entry.
 * Entries are enumerated (filter returns false) but never inflated.
 * Throws a plain Error; callers wrap in their domain error.
 */
export function assertNonEmptyZip(bytes: Uint8Array): void {
  if (bytes.length === 0) {
    throw new Error("Archive is empty");
  }
  if (!ZIP_LOCAL_HEADER.every((b, i) => bytes[i] === b)) {
    throw new Error("Archive is not a zip file");
  }
  let entries = 0;
  try {
    unzipSync(bytes, {
      filter: () => {
        entries += 1;
        return false;
      },
    });
  } catch {
    throw new Error("Archive is not a valid zip file");
  }
  if (entries === 0) {
    throw new Error("Archive contains no entries");
  }
}
