import { z } from "zod";
import {
  CardDetailSchema,
  CardListItemSchema,
  CardVersionDetailSchema,
} from "./cards";
import { PaginationMetaSchema } from "./pagination";
import { CardVoteCountsSchema } from "./votes";

export const ClothesVersionDetailSchema = CardVersionDetailSchema.extend({
  contentHash: z.string().min(1),
  originalPath: z.string().min(1),
  previewPath: z.string().min(1),
});
export type ClothesVersionDetail = z.infer<typeof ClothesVersionDetailSchema>;

export const ClothesListItemSchema = CardListItemSchema.merge(
  CardVoteCountsSchema,
).extend({
  uploaderId: z.string().min(1),
});
export type ClothesListItem = z.infer<typeof ClothesListItemSchema>;

export const ClothesDetailSchema = CardDetailSchema.omit({ versions: true })
  .merge(CardVoteCountsSchema)
  .extend({
    uploaderId: z.string().min(1),
    authorUsername: z.string().nullable().optional(),
    authorAvatar: z.string().nullable().optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    versions: z.array(ClothesVersionDetailSchema),
  });
export type ClothesDetail = z.infer<typeof ClothesDetailSchema>;

export const ClothesListResponseSchema = z
  .object({
    clothes: z.array(ClothesListItemSchema),
  })
  .merge(PaginationMetaSchema);
export type ClothesListResponse = z.infer<typeof ClothesListResponseSchema>;
