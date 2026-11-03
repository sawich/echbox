import type { UserProfile } from "@echbox/shared";
import { eq } from "drizzle-orm";
import { listCharacters } from "../cards/service";
import { getLikesReceivedForAuthor } from "../cards/votes";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { listPlugins } from "../plugins/service";
import { getPluginLikesReceivedForAuthor } from "../plugins/votes";
import { listClothes } from "../clothes/service";
import { getLikesReceivedForAuthor as getClothesLikesReceivedForAuthor } from "../clothes/votes";
import { listScenes } from "../scenes/service";
import { getLikesReceivedForAuthor as getSceneLikesReceivedForAuthor } from "../scenes/votes";
import { listSoftmods } from "../softmods/service";
import { getSoftmodLikesReceivedForAuthor } from "../softmods/votes";

export type GetUserProfileOptions = {
  dbPath?: string;
  viewerUserId?: string | null;
};

export async function getUserProfile(
  userId: string,
  options?: GetUserProfileOptions,
): Promise<UserProfile | null> {
  const db = getDb(options?.dbPath);
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;

  const listOpts = {
    dbPath: options?.dbPath,
    viewerUserId: options?.viewerUserId,
  };

  const cards = (await listCharacters(listOpts)).filter(
    (c) => c.authorId === userId,
  );
  const plugins = (await listPlugins(listOpts)).filter(
    (p) => p.authorId === userId,
  );
  const softmods = (await listSoftmods(listOpts)).filter(
    (s) => s.authorId === userId,
  );
  const scenes = (await listScenes(listOpts)).filter(
    (s) => s.authorId === userId,
  );
  const clothesItems = (await listClothes(listOpts)).filter(
    (c) => c.authorId === userId,
  );

  const cardVotes = getLikesReceivedForAuthor(userId, options?.dbPath);
  const pluginVotes = getPluginLikesReceivedForAuthor(
    userId,
    options?.dbPath,
  );
  const softmodVotes = getSoftmodLikesReceivedForAuthor(
    userId,
    options?.dbPath,
  );
  const sceneVotes = getSceneLikesReceivedForAuthor(
    userId,
    options?.dbPath,
  );
  const clothesVotes = getClothesLikesReceivedForAuthor(
    userId,
    options?.dbPath,
  );

  return {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    createdAt: user.createdAt,
    stats: {
      uploadCount:
        cards.length +
        plugins.length +
        softmods.length +
        scenes.length +
        clothesItems.length,
      likesReceived:
        cardVotes.likesReceived +
        pluginVotes.likesReceived +
        softmodVotes.likesReceived +
        sceneVotes.likesReceived +
        clothesVotes.likesReceived,
      dislikesReceived:
        cardVotes.dislikesReceived +
        pluginVotes.dislikesReceived +
        softmodVotes.dislikesReceived +
        sceneVotes.dislikesReceived +
        clothesVotes.dislikesReceived,
    },
    cards,
    plugins,
    softmods,
    scenes,
    clothes: clothesItems,
  };
}
