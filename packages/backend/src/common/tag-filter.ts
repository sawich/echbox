import type { TaggableContentKind } from "@echbox/shared";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { tagAliases, tags } from "../db/schema";
import { normalizeTagName } from "../tags/normalize";
import { contentIdsHavingAllTags } from "../tags/service";

/** Trimmed tag names from a list query. Empty means the caller must not filter. */
export function tagFilterNames(tagsInput: string[] | undefined): string[] {
  if (!tagsInput || tagsInput.length === 0) return [];
  return tagsInput.map((name) => name.trim()).filter((name) => name.length > 0);
}

/**
 * Ids of content that has every named tag.
 * Only call with a non-empty name list — an empty list must not hit
 * `contentIdsHavingAllTags`, which treats empty tag ids as "every parent".
 * A name that does not resolve (including aliases) matches nothing.
 */
export function contentIdsMatchingAllTagNames(input: {
  kind: TaggableContentKind;
  names: string[];
  dbPath?: string;
}): string[] {
  if (input.names.length === 0) {
    throw new Error("tag filter requires at least one tag name");
  }

  const db = getDb(input.dbPath);
  const tagIds: string[] = [];
  const seen = new Set<string>();

  for (const raw of input.names) {
    let name: string;
    try {
      name = normalizeTagName(raw);
    } catch {
      return [];
    }

    const byName = db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, name))
      .get();
    const tagId =
      byName?.id ??
      db
        .select({ tagId: tagAliases.tagId })
        .from(tagAliases)
        .where(eq(tagAliases.alias, name))
        .get()?.tagId;
    if (!tagId) return [];
    if (seen.has(tagId)) continue;
    seen.add(tagId);
    tagIds.push(tagId);
  }

  return contentIdsHavingAllTags({
    kind: input.kind,
    tagIds,
    dbPath: input.dbPath,
  });
}
