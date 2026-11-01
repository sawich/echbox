import { z } from "zod";
import { CharacterCardListItemSchema } from "./cards";
import { PluginListItemSchema } from "./plugins";
import { SceneListItemSchema } from "./scenes";
import { SoftmodListItemSchema } from "./softmods";

export const UserProfileStatsSchema = z.object({
  uploadCount: z.number().int().nonnegative(),
  likesReceived: z.number().int().nonnegative(),
  dislikesReceived: z.number().int().nonnegative(),
});
export type UserProfileStats = z.infer<typeof UserProfileStatsSchema>;

export const UserProfileCardSchema = CharacterCardListItemSchema;
export type UserProfileCard = z.infer<typeof UserProfileCardSchema>;

export const UserProfilePluginSchema = PluginListItemSchema;
export type UserProfilePlugin = z.infer<typeof UserProfilePluginSchema>;

export const UserProfileSoftmodSchema = SoftmodListItemSchema;
export type UserProfileSoftmod = z.infer<typeof UserProfileSoftmodSchema>;

export const UserProfileSceneSchema = SceneListItemSchema;
export type UserProfileScene = z.infer<typeof UserProfileSceneSchema>;

export const UserProfileSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  avatar: z.string().nullable(),
  createdAt: z.iso.datetime(),
  stats: UserProfileStatsSchema,
  cards: z.array(UserProfileCardSchema),
  plugins: z.array(UserProfilePluginSchema),
  softmods: z.array(UserProfileSoftmodSchema),
  scenes: z.array(UserProfileSceneSchema),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;
