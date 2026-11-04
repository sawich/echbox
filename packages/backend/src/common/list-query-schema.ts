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
  q: t.Optional(t.String({ description: "Search title/slug" })),
  sort: t.Optional(
    t.Union(
      [t.Literal("recent"), t.Literal("top"), t.Literal("title")],
      { description: "Sort mode (default recent)" },
    ),
  ),
};

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
