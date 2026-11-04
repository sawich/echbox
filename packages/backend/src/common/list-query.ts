import type { CatalogSort } from "@echbox/shared";
import {
  type AnyColumn,
  type SQL,
  asc,
  desc,
  like,
  or,
  sql,
} from "drizzle-orm";
import { parsePagination, type PaginatedList } from "./pagination";

export type { PaginatedList };

export type CatalogListQuery = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: CatalogSort | string | null;
  /** Skip LIMIT/OFFSET — profile author uploads must not be truncated. */
  unbounded?: boolean;
};

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function titleSlugSearch(
  titleCol: AnyColumn,
  slugCol: AnyColumn | null,
  q: string,
): SQL | undefined {
  const needle = q.trim();
  if (!needle) return undefined;
  const pattern = `%${escapeLikePattern(needle)}%`;
  if (slugCol) {
    return or(like(titleCol, pattern), like(slugCol, pattern));
  }
  return like(titleCol, pattern);
}

/** Net score (likes − dislikes) for ORDER BY top. */
export function voteNetScore(votesTable: string, fkColumn: string, idCol: AnyColumn): SQL {
  return sql`(
    (select count(*) from ${sql.raw(votesTable)}
      where ${sql.raw(fkColumn)} = ${idCol} and vote = 'like')
    -
    (select count(*) from ${sql.raw(votesTable)}
      where ${sql.raw(fkColumn)} = ${idCol} and vote = 'dislike')
  )`;
}

export function resolveListWindow(options?: CatalogListQuery): {
  page: number;
  limit: number;
  offset: number;
  sort: CatalogSort;
  q: string;
  unbounded: boolean;
} {
  const parsed = parsePagination(options);
  const unbounded =
    options?.unbounded === true ||
    (options?.page == null && options?.limit == null);
  return {
    ...parsed,
    unbounded,
  };
}

export function orderBySort(
  sort: CatalogSort,
  createdAt: AnyColumn,
  title: AnyColumn,
  scoreSql: SQL,
): SQL[] {
  if (sort === "title") return [asc(title)];
  if (sort === "top") return [desc(scoreSql), desc(createdAt)];
  return [desc(createdAt)];
}
