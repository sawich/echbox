const CANONICAL_TAG_NAME = /^[a-z0-9_]+$/;

export function normalizeTagName(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");

  if (normalized === "" || !CANONICAL_TAG_NAME.test(normalized)) {
    throw new Error("Invalid tag name");
  }

  return normalized;
}
