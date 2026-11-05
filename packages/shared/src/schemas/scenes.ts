import { z } from "zod";
import {
  CardDetailSchema,
  CardListItemSchema,
  CardVersionDetailSchema,
} from "./cards";
import { PaginationMetaSchema } from "./pagination";
import { CardVoteCountsSchema } from "./votes";

export const SceneVersionDetailSchema = CardVersionDetailSchema.extend({
  contentHash: z.string().min(1),
  originalPath: z.string().min(1),
  previewPath: z.string().min(1),
});
export type SceneVersionDetail = z.infer<typeof SceneVersionDetailSchema>;

export const SceneListItemSchema = CardListItemSchema.merge(
  CardVoteCountsSchema,
).extend({
  uploaderId: z.string().min(1),
});
export type SceneListItem = z.infer<typeof SceneListItemSchema>;

export const SceneDetailSchema = CardDetailSchema.omit({ versions: true })
  .merge(CardVoteCountsSchema)
  .extend({
    uploaderId: z.string().min(1),
    authorUsername: z.string().nullable().optional(),
    authorAvatar: z.string().nullable().optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    versions: z.array(SceneVersionDetailSchema),
  });
export type SceneDetail = z.infer<typeof SceneDetailSchema>;

export const SceneListResponseSchema = z
  .object({
    scenes: z.array(SceneListItemSchema),
  })
  .merge(PaginationMetaSchema);
export type SceneListResponse = z.infer<typeof SceneListResponseSchema>;
