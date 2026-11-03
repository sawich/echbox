import { z } from "zod";
import { CardVoteCountsSchema } from "./votes";

export const PluginUploaderSchema = z.object({
  id: z.string().min(1),
  username: z.string(),
});
export type PluginUploader = z.infer<typeof PluginUploaderSchema>;

export const PluginListItemSchema = CardVoteCountsSchema.extend({
  id: z.string().min(1),
  gameId: z.string().min(1),
  authorId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  latestSemver: z.string().nullable(),
  latestVersionId: z.string().nullable(),
  versionCount: z.number().int().nonnegative(),
  downloadUrl: z.string(),
  uploader: PluginUploaderSchema,
});
export type PluginListItem = z.infer<typeof PluginListItemSchema>;
