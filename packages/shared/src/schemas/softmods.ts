import { z } from "zod";
import { PaginationMetaSchema } from "./pagination";
import { ContentTagRefSchema } from "./tags";
import { CardVoteCountsSchema } from "./votes";

export const SoftmodUploaderSchema = z.object({
  id: z.string().min(1),
  username: z.string(),
});
export type SoftmodUploader = z.infer<typeof SoftmodUploaderSchema>;

export const SoftmodListItemSchema = CardVoteCountsSchema.extend({
  id: z.string().min(1),
  gameId: z.string().min(1),
  uploaderId: z.string().min(1),
  description: z.string(),
  previewUrls: z.array(z.string()).max(3),
  website: z.string().nullable().optional(),
  latestSemver: z.string().nullable(),
  latestVersionId: z.string().nullable(),
  versionCount: z.number().int().nonnegative(),
  downloadUrl: z.string(),
  uploader: SoftmodUploaderSchema,
  tags: z.array(ContentTagRefSchema).default([]),
});
export type SoftmodListItem = z.infer<typeof SoftmodListItemSchema>;

export const SoftmodListResponseSchema = z
  .object({
    softmods: z.array(SoftmodListItemSchema),
  })
  .merge(PaginationMetaSchema);
export type SoftmodListResponse = z.infer<typeof SoftmodListResponseSchema>;
