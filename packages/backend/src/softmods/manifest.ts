import { strFromU8, unzipSync } from "fflate";
import { isSafeStorageId } from "../common/safe-path";

export type SoftmodManifest = {
  guid: string;
  name: string;
  version: string;
  author: string;
  description: string;
  website: string | null;
  raw: Record<string, unknown>;
};

const MANIFEST_ENTRY = "manifest.xml";
/** Upper bound for the inflated manifest.xml (decompression-bomb guard). */
const MAX_MANIFEST_BYTES = 1024 * 1024;

function manifestEntryName(path: string): string | null {
  const normalized = path.startsWith("./") ? path.slice(2) : path;
  if (normalized === MANIFEST_ENTRY) {
    return path;
  }
  return null;
}

function readManifestXml(entries: Record<string, Uint8Array>): string {
  for (const path of Object.keys(entries)) {
    if (manifestEntryName(path) !== null) {
      return strFromU8(entries[path]!);
    }
  }
  throw new Error("Softmod archive is missing manifest.xml");
}

function readTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const match = xml.match(re);
  if (!match) {
    return undefined;
  }
  return match[1]!.trim();
}

function parseManifestXml(xml: string): SoftmodManifest {
  const guid = readTag(xml, "guid");
  if (!guid) {
    throw new Error("Softmod manifest is missing a guid");
  }
  if (!isSafeStorageId(guid)) {
    throw new Error(
      "Softmod manifest guid is invalid (letters, digits, dots, hyphens and underscores only)",
    );
  }

  const name = readTag(xml, "name") ?? "";
  const version = readTag(xml, "version") ?? "";
  const author = readTag(xml, "author") ?? "";
  const description = readTag(xml, "description") ?? "";
  const websiteRaw = readTag(xml, "website");
  const website =
    websiteRaw === undefined || websiteRaw === "" ? null : websiteRaw;

  const raw: Record<string, unknown> = {
    guid,
    name,
    version,
    author,
    description,
    website,
  };

  return {
    guid,
    name,
    version,
    author,
    description,
    website,
    raw,
  };
}

export function parseSoftmodManifest(archiveBytes: Uint8Array): SoftmodManifest {
  let manifestTooLarge = false;
  let entries: Record<string, Uint8Array>;
  try {
    // Only inflate manifest.xml; never decompress other entries.
    entries = unzipSync(archiveBytes, {
      filter: (file) => {
        if (manifestEntryName(file.name) === null) return false;
        if (file.originalSize > MAX_MANIFEST_BYTES) {
          manifestTooLarge = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new Error("Softmod archive is not a valid zip file");
  }
  if (manifestTooLarge) {
    throw new Error("Softmod manifest.xml is too large");
  }
  const xml = readManifestXml(entries);
  return parseManifestXml(xml);
}
