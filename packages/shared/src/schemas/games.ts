import { z } from "zod";

export const GameIconUrlsSchema = z.object({
  "32": z.string().min(1),
  "64": z.string().min(1),
  "128": z.string().min(1),
  "256": z.string().min(1),
});
export type GameIconUrls = z.infer<typeof GameIconUrlsSchema>;

export const GameListItemSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  createdByUserId: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  iconUrls: GameIconUrlsSchema,
});
export type GameListItem = z.infer<typeof GameListItemSchema>;

export const GameDetailSchema = GameListItemSchema;
export type GameDetail = z.infer<typeof GameDetailSchema>;

export const GameListResponseSchema = z.object({
  games: z.array(GameListItemSchema),
});
export type GameListResponse = z.infer<typeof GameListResponseSchema>;

export const CreateGameBodySchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});
export type CreateGameBody = z.infer<typeof CreateGameBodySchema>;
