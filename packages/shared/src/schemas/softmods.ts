import { z } from "zod";
import { CardVoteCountsSchema } from "./votes";

export const SoftmodUploaderSchema = z.object({
  id: z.string().min(1),
  username: z.string(),
});
export type SoftmodUploader = z.infer<typeof SoftmodUploaderSchema>;

export const SoftmodListItemSchema = CardVoteCountsSchema.extend({
  id: z.string().min(1),
  gameId: z.string().min(1),
  authorId: z.string().min(1),
  title: z.string().min(1),
  modAuthor: z.string().nullable(),
  description: z.string().optional(),
  website: z.string().nullable().optional(),
  latestSemver: z.string().min(1),
  latestVersionId: z.string().min(1),
  versionCount: z.number().int().positive(),
  downloadUrl: z.string().min(1),
  uploader: SoftmodUploaderSchema,
});
export type SoftmodListItem = z.infer<typeof SoftmodListItemSchema>;
