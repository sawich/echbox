import { z } from "zod";
import { CardVoteCountsSchema } from "./votes";

export const CardTypeSchema = z.enum(["character", "scene"]);
export type CardType = z.infer<typeof CardTypeSchema>;

export const CardVersionDetailSchema = z.object({
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  notes: z.string().optional(),
  imageUrl: z.string().min(1),
  summary: z.record(z.string(), z.unknown()),
});

export const CardListItemSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().min(1),
  type: CardTypeSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  latestVersion: z.number().int().positive(),
  versionCount: z.number().int().positive(),
  imageUrl: z.string().min(1),
  summary: z.record(z.string(), z.unknown()),
});
export type CardListItem = z.infer<typeof CardListItemSchema>;

export const CharacterCardListItemSchema = CardListItemSchema.merge(
  CardVoteCountsSchema,
).extend({
  authorId: z.string().min(1),
});
export type CharacterCardListItem = z.infer<typeof CharacterCardListItemSchema>;

export const CardListResponseSchema = z.object({
  cards: z.array(CardListItemSchema),
});
export type CardListResponse = z.infer<typeof CardListResponseSchema>;

export const CardDetailSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().min(1),
  type: CardTypeSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  latestVersion: z.number().int().positive(),
  versions: z.array(CardVersionDetailSchema).min(1),
});
export type CardDetail = z.infer<typeof CardDetailSchema>;

export const CharacterCardDetailSchema = CardDetailSchema.merge(
  CardVoteCountsSchema,
).extend({
  authorId: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CharacterCardDetailShared = z.infer<
  typeof CharacterCardDetailSchema
>;
