import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull(),
  avatar: text("avatar"),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: text("expires_at").notNull(),
});

export const games = sqliteTable(
  "games",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("games_created_by_user_id_idx").on(table.createdByUserId)],
);

export const characterCards = sqliteTable(
  "character_cards",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    latestVersion: integer("latest_version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("character_cards_author_id_idx").on(table.authorId),
    index("character_cards_game_id_idx").on(table.gameId),
  ],
);

export const characterCardVersions = sqliteTable(
  "character_card_versions",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => characterCards.id),
    version: integer("version").notNull(),
    notes: text("notes"),
    contentHash: text("content_hash").notNull().unique(),
    originalPath: text("original_path").notNull(),
    previewPath: text("preview_path").notNull(),
    summaryJson: text("summary_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("character_card_versions_card_id_version_idx").on(
      table.cardId,
      table.version,
    ),
  ],
);

/** "like" | "dislike" stored as text */
export const cardVotes = sqliteTable(
  "card_votes",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => characterCards.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    vote: text("vote").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("card_votes_card_id_user_id_idx").on(table.cardId, table.userId),
    index("card_votes_card_id_idx").on(table.cardId),
    index("card_votes_user_id_idx").on(table.userId),
  ],
);

export type CardVoteValue = "like" | "dislike";

export const scenes = sqliteTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    latestVersion: integer("latest_version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("scenes_author_id_idx").on(table.authorId),
    index("scenes_game_id_idx").on(table.gameId),
  ],
);

export const sceneVersions = sqliteTable(
  "scene_versions",
  {
    id: text("id").primaryKey(),
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id),
    version: integer("version").notNull(),
    notes: text("notes"),
    contentHash: text("content_hash").notNull().unique(),
    originalPath: text("original_path").notNull(),
    previewPath: text("preview_path").notNull(),
    summaryJson: text("summary_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("scene_versions_scene_id_version_idx").on(
      table.sceneId,
      table.version,
    ),
  ],
);

/** "like" | "dislike" stored as text */
export const sceneVotes = sqliteTable(
  "scene_votes",
  {
    id: text("id").primaryKey(),
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    vote: text("vote").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("scene_votes_scene_id_user_id_idx").on(
      table.sceneId,
      table.userId,
    ),
    index("scene_votes_scene_id_idx").on(table.sceneId),
    index("scene_votes_user_id_idx").on(table.userId),
  ],
);

export type SceneVoteValue = "like" | "dislike";

export const softmods = sqliteTable(
  "softmods",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    modAuthor: text("mod_author"),
    description: text("description").notNull(),
    website: text("website"),
    latestVersion: integer("latest_version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("softmods_author_id_idx").on(table.authorId),
    index("softmods_game_id_idx").on(table.gameId),
  ],
);

export const softmodVersions = sqliteTable(
  "softmod_versions",
  {
    id: text("id").primaryKey(),
    softmodId: text("softmod_id")
      .notNull()
      .references(() => softmods.id),
    version: integer("version").notNull(),
    packageVersion: text("package_version").notNull(),
    notes: text("notes"),
    contentHash: text("content_hash").notNull().unique(),
    originalPath: text("original_path").notNull(),
    summaryJson: text("summary_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("softmod_versions_softmod_id_version_idx").on(
      table.softmodId,
      table.version,
    ),
  ],
);

/** "like" | "dislike" stored as text */
export const softmodVotes = sqliteTable(
  "softmod_votes",
  {
    id: text("id").primaryKey(),
    softmodId: text("softmod_id")
      .notNull()
      .references(() => softmods.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    vote: text("vote").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("softmod_votes_softmod_id_user_id_idx").on(
      table.softmodId,
      table.userId,
    ),
    index("softmod_votes_softmod_id_idx").on(table.softmodId),
    index("softmod_votes_user_id_idx").on(table.userId),
  ],
);

export type SoftmodVoteValue = "like" | "dislike";

export const plugins = sqliteTable(
  "plugins",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    latestVersion: integer("latest_version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("plugins_author_id_idx").on(table.authorId),
    index("plugins_game_id_idx").on(table.gameId),
  ],
);

export const pluginVersions = sqliteTable(
  "plugin_versions",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id),
    version: integer("version").notNull(),
    notes: text("notes"),
    contentHash: text("content_hash").notNull().unique(),
    originalPath: text("original_path").notNull(),
    summaryJson: text("summary_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("plugin_versions_plugin_id_version_idx").on(
      table.pluginId,
      table.version,
    ),
  ],
);

/** "like" | "dislike" stored as text */
export const pluginVotes = sqliteTable(
  "plugin_votes",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    vote: text("vote").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("plugin_votes_plugin_id_user_id_idx").on(
      table.pluginId,
      table.userId,
    ),
    index("plugin_votes_plugin_id_idx").on(table.pluginId),
    index("plugin_votes_user_id_idx").on(table.userId),
  ],
);

export type PluginVoteValue = "like" | "dislike";

export const oauthPending = sqliteTable("oauth_pending", {
  state: text("state").primaryKey(),
  codeVerifier: text("code_verifier").notNull(),
  desktop: integer("desktop").notNull(),
  nonce: text("nonce"),
  expiresAt: text("expires_at").notNull(),
});

export const authClaims = sqliteTable("auth_claims", {
  token: text("token").primaryKey(),
  sessionId: text("session_id").notNull(),
  nonce: text("nonce"),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});
