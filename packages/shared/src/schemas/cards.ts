import { z } from "zod";
import { PaginationMetaSchema } from "./pagination";
import { CardVoteCountsSchema } from "./votes";

export const CardTypeSchema = z.enum(["character", "scene", "clothes"]);
export type CardType = z.infer<typeof CardTypeSchema>;

export const CardVersionDetailSchema = z.object({
  id: z.string().min(1),
  semver: z.string().min(1),
  createdAt: z.iso.datetime(),
  notes: z.string().optional(),
  imageUrl: z.string().min(1),
  summary: z.record(z.string(), z.unknown()),
});

export const CardListItemSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().min(1),
  type: CardTypeSchema,
  description: z.string(),
  latestSemver: z.string().nullable(),
  latestVersionId: z.string().nullable(),
  versionCount: z.number().int().nonnegative(),
  imageUrl: z.string(),
  summary: z.record(z.string(), z.unknown()),
});
export type CardListItem = z.infer<typeof CardListItemSchema>;

export const CharacterCardListItemSchema = CardListItemSchema.merge(
  CardVoteCountsSchema,
).extend({
  uploaderId: z.string().min(1),
});
export type CharacterCardListItem = z.infer<typeof CharacterCardListItemSchema>;

export const CardListResponseSchema = z
  .object({
    cards: z.array(CardListItemSchema),
  })
  .merge(PaginationMetaSchema);
export type CardListResponse = z.infer<typeof CardListResponseSchema>;

export const CardDetailSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().min(1),
  type: CardTypeSchema,
  description: z.string(),
  latestSemver: z.string().nullable(),
  latestVersionId: z.string().nullable(),
  versions: z.array(CardVersionDetailSchema),
});
export type CardDetail = z.infer<typeof CardDetailSchema>;

export const CharacterCardDetailSchema = CardDetailSchema.merge(
  CardVoteCountsSchema,
).extend({
  uploaderId: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CharacterCardDetailShared = z.infer<
  typeof CharacterCardDetailSchema
>;
