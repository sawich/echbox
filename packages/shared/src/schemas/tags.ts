import { z } from "zod";
import { CardVoteValueSchema } from "./votes";

export const TagCategorySchema = z.enum([
  "author",
  "license",
  "character",
  "franchise",
  "general",
]);
export type TagCategory = z.infer<typeof TagCategorySchema>;

export const TaggableContentKindSchema = z.enum([
  "cards",
  "clothes",
  "scenes",
  "softmods",
]);
export type TaggableContentKind = z.infer<typeof TaggableContentKindSchema>;

const tagCoreFields = {
  id: z.string().min(1),
  name: z.string().min(1),
  category: TagCategorySchema,
  likes: z.number().int().nonnegative(),
  dislikes: z.number().int().nonnegative(),
  myVote: CardVoteValueSchema.nullable().optional(),
  usageCount: z.number().int().nonnegative().optional(),
};

export const TagListItemSchema = z.object(tagCoreFields);
export type TagListItem = z.infer<typeof TagListItemSchema>;

export const TagSchema = TagListItemSchema;
export type Tag = z.infer<typeof TagSchema>;
