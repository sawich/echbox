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

export const characterCards = sqliteTable(
  "character_cards",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    latestVersion: integer("latest_version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("character_cards_author_id_idx").on(table.authorId)],
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
