import { t } from "elysia";
import { parsePagination } from "./pagination";

export const catalogListQueryFields = {
  page: t.Optional(
    t.Numeric({
      minimum: 1,
      description: "1-based page (default 1)",
    }),
  ),
  limit: t.Optional(
    t.Numeric({
      minimum: 1,
      maximum: 100,
      description: "Items per page (default 24, max 100)",
    }),
  ),
  q: t.Optional(t.String({ description: "Search plugin title" })),
  sort: t.Optional(
    t.Union(
      [t.Literal("recent"), t.Literal("top"), t.Literal("title")],
      { description: "Sort mode (default recent)" },
    ),
  ),
};

export const tagsQueryField = t.Optional(
  t.Union([t.String(), t.Array(t.String())], {
    description:
      "Canonical tag names the item must all have. Repeat the parameter or comma-separate names.",
  }),
);

/** List query for cards, scenes, clothes, and softmods. No title search. */
export const taggableListQueryFields = {
  page: catalogListQueryFields.page,
  limit: catalogListQueryFields.limit,
  tags: tagsQueryField,
  sort: t.Optional(
    t.Union([t.Literal("recent"), t.Literal("top")], {
      description: "Sort mode (default recent)",
    }),
  ),
};

export function tagsFromQuery(tags: string | string[] | undefined): string[] {
  if (tags == null) return [];
  const parts = Array.isArray(tags) ? tags : [tags];
  const names: string[] = [];
  for (const part of parts) {
    for (const name of part.split(",")) {
      const trimmed = name.trim();
      if (trimmed) names.push(trimmed);
    }
  }
  return names;
}

export function listOptsFromQuery(query: {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  gameId?: string;
}) {
  const { page, limit, q, sort } = parsePagination(query);
  return {
    page,
    limit,
    q: q || undefined,
    sort,
    gameId: query.gameId,
  };
}
