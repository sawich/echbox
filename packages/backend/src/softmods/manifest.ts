import { strFromU8, unzipSync } from "fflate";

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
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(archiveBytes);
  } catch {
    throw new Error("Softmod archive is not a valid zip file");
  }
  const xml = readManifestXml(entries);
  return parseManifestXml(xml);
}
