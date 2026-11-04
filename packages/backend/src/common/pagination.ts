import {
  type CatalogSort,
  DEFAULT_PAGE,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from "@echbox/shared";

export type ParsedPagination = {
  page: number;
  limit: number;
  offset: number;
  sort: CatalogSort;
  q: string;
};

export function parsePagination(input?: {
  page?: number | string | null;
  limit?: number | string | null;
  q?: string | null;
  sort?: string | null;
}): ParsedPagination {
  const pageRaw = Number(input?.page ?? DEFAULT_PAGE);
  const limitRaw = Number(input?.limit ?? DEFAULT_PAGE_LIMIT);
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : DEFAULT_PAGE;
  let limit =
    Number.isFinite(limitRaw) && limitRaw >= 1
      ? Math.floor(limitRaw)
      : DEFAULT_PAGE_LIMIT;
  if (limit > MAX_PAGE_LIMIT) limit = MAX_PAGE_LIMIT;

  const sortRaw = input?.sort?.trim();
  const sort: CatalogSort =
    sortRaw === "top" || sortRaw === "title" || sortRaw === "recent"
      ? sortRaw
      : "recent";

  const q = input?.q?.trim() ?? "";

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    sort,
    q,
  };
}

export type PaginatedList<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};
