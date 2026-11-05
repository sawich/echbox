import { z } from "zod";

export const CatalogSortSchema = z.enum(["recent", "top", "title"]);
export type CatalogSort = z.infer<typeof CatalogSortSchema>;

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_LIMIT = 24;
export const MAX_PAGE_LIMIT = 100;

export const PaginationMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

/** Coerce query-string numbers for list endpoints. */
export const ListPaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_LIMIT).optional(),
  q: z.string().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  sort: CatalogSortSchema.optional(),
});
export type ListPaginationQuery = z.infer<typeof ListPaginationQuerySchema>;
