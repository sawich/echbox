-- Cascade delete catalog content when a game is removed.
-- Recreate parent + child tables so FK order works inside Drizzle's transaction.
CREATE TABLE `__new_character_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`author_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`latest_semver` text,
	`latest_version_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_character_cards`("id", "game_id", "author_id", "slug", "title", "latest_semver", "latest_version_id", "created_at", "updated_at") SELECT "id", "game_id", "author_id", "slug", "title", "latest_semver", "latest_version_id", "created_at", "updated_at" FROM `character_cards`;--> statement-breakpoint
CREATE TABLE `__new_character_card_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`preview_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `__new_character_cards`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_character_card_versions`("id", "card_id", "semver", "notes", "content_hash", "original_path", "preview_path", "summary_json", "created_at") SELECT "id", "card_id", "semver", "notes", "content_hash", "original_path", "preview_path", "summary_json", "created_at" FROM `character_card_versions`;--> statement-breakpoint
CREATE TABLE `__new_card_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `__new_character_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_card_votes`("id", "card_id", "user_id", "vote", "created_at", "updated_at") SELECT "id", "card_id", "user_id", "vote", "created_at", "updated_at" FROM `card_votes`;--> statement-breakpoint
DROP TABLE `card_votes`;--> statement-breakpoint
DROP TABLE `character_card_versions`;--> statement-breakpoint
DROP TABLE `character_cards`;--> statement-breakpoint
ALTER TABLE `__new_character_cards` RENAME TO `character_cards`;--> statement-breakpoint
ALTER TABLE `__new_character_card_versions` RENAME TO `character_card_versions`;--> statement-breakpoint
ALTER TABLE `__new_card_votes` RENAME TO `card_votes`;--> statement-breakpoint
CREATE INDEX `character_cards_author_id_idx` ON `character_cards` (`author_id`);--> statement-breakpoint
CREATE INDEX `character_cards_game_id_idx` ON `character_cards` (`game_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `character_card_versions_content_hash_unique` ON `character_card_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `character_card_versions_card_id_semver_idx` ON `character_card_versions` (`card_id`,`semver`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_votes_card_id_user_id_idx` ON `card_votes` (`card_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `card_votes_card_id_idx` ON `card_votes` (`card_id`);--> statement-breakpoint
CREATE INDEX `card_votes_user_id_idx` ON `card_votes` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`author_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`latest_semver` text,
	`latest_version_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_scenes`("id", "game_id", "author_id", "slug", "title", "latest_semver", "latest_version_id", "created_at", "updated_at") SELECT "id", "game_id", "author_id", "slug", "title", "latest_semver", "latest_version_id", "created_at", "updated_at" FROM `scenes`;--> statement-breakpoint
CREATE TABLE `__new_scene_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`preview_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `__new_scenes`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_scene_versions`("id", "scene_id", "semver", "notes", "content_hash", "original_path", "preview_path", "summary_json", "created_at") SELECT "id", "scene_id", "semver", "notes", "content_hash", "original_path", "preview_path", "summary_json", "created_at" FROM `scene_versions`;--> statement-breakpoint
CREATE TABLE `__new_scene_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `__new_scenes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_scene_votes`("id", "scene_id", "user_id", "vote", "created_at", "updated_at") SELECT "id", "scene_id", "user_id", "vote", "created_at", "updated_at" FROM `scene_votes`;--> statement-breakpoint
DROP TABLE `scene_votes`;--> statement-breakpoint
DROP TABLE `scene_versions`;--> statement-breakpoint
DROP TABLE `scenes`;--> statement-breakpoint
ALTER TABLE `__new_scenes` RENAME TO `scenes`;--> statement-breakpoint
ALTER TABLE `__new_scene_versions` RENAME TO `scene_versions`;--> statement-breakpoint
ALTER TABLE `__new_scene_votes` RENAME TO `scene_votes`;--> statement-breakpoint
CREATE INDEX `scenes_author_id_idx` ON `scenes` (`author_id`);--> statement-breakpoint
CREATE INDEX `scenes_game_id_idx` ON `scenes` (`game_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `scene_versions_content_hash_unique` ON `scene_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `scene_versions_scene_id_semver_idx` ON `scene_versions` (`scene_id`,`semver`);--> statement-breakpoint
CREATE UNIQUE INDEX `scene_votes_scene_id_user_id_idx` ON `scene_votes` (`scene_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `scene_votes_scene_id_idx` ON `scene_votes` (`scene_id`);--> statement-breakpoint
CREATE INDEX `scene_votes_user_id_idx` ON `scene_votes` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_softmods` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`mod_author` text,
	`description` text NOT NULL,
	`website` text,
	`latest_semver` text,
	`latest_version_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_softmods`("id", "game_id", "author_id", "title", "mod_author", "description", "website", "latest_semver", "latest_version_id", "created_at", "updated_at") SELECT "id", "game_id", "author_id", "title", "mod_author", "description", "website", "latest_semver", "latest_version_id", "created_at", "updated_at" FROM `softmods`;--> statement-breakpoint
CREATE TABLE `__new_softmod_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`softmod_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`softmod_id`) REFERENCES `__new_softmods`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_softmod_versions`("id", "softmod_id", "semver", "notes", "content_hash", "original_path", "summary_json", "created_at") SELECT "id", "softmod_id", "semver", "notes", "content_hash", "original_path", "summary_json", "created_at" FROM `softmod_versions`;--> statement-breakpoint
CREATE TABLE `__new_softmod_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`softmod_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`softmod_id`) REFERENCES `__new_softmods`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_softmod_votes`("id", "softmod_id", "user_id", "vote", "created_at", "updated_at") SELECT "id", "softmod_id", "user_id", "vote", "created_at", "updated_at" FROM `softmod_votes`;--> statement-breakpoint
DROP TABLE `softmod_votes`;--> statement-breakpoint
DROP TABLE `softmod_versions`;--> statement-breakpoint
DROP TABLE `softmods`;--> statement-breakpoint
ALTER TABLE `__new_softmods` RENAME TO `softmods`;--> statement-breakpoint
ALTER TABLE `__new_softmod_versions` RENAME TO `softmod_versions`;--> statement-breakpoint
ALTER TABLE `__new_softmod_votes` RENAME TO `softmod_votes`;--> statement-breakpoint
CREATE INDEX `softmods_author_id_idx` ON `softmods` (`author_id`);--> statement-breakpoint
CREATE INDEX `softmods_game_id_idx` ON `softmods` (`game_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `softmod_versions_content_hash_unique` ON `softmod_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `softmod_versions_softmod_id_semver_idx` ON `softmod_versions` (`softmod_id`,`semver`);--> statement-breakpoint
CREATE UNIQUE INDEX `softmod_votes_softmod_id_user_id_idx` ON `softmod_votes` (`softmod_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `softmod_votes_softmod_id_idx` ON `softmod_votes` (`softmod_id`);--> statement-breakpoint
CREATE INDEX `softmod_votes_user_id_idx` ON `softmod_votes` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`latest_semver` text,
	`latest_version_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_plugins`("id", "game_id", "author_id", "title", "description", "latest_semver", "latest_version_id", "created_at", "updated_at") SELECT "id", "game_id", "author_id", "title", "description", "latest_semver", "latest_version_id", "created_at", "updated_at" FROM `plugins`;--> statement-breakpoint
CREATE TABLE `__new_plugin_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `__new_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_plugin_versions`("id", "plugin_id", "semver", "notes", "content_hash", "original_path", "summary_json", "created_at") SELECT "id", "plugin_id", "semver", "notes", "content_hash", "original_path", "summary_json", "created_at" FROM `plugin_versions`;--> statement-breakpoint
CREATE TABLE `__new_plugin_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `__new_plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_plugin_votes`("id", "plugin_id", "user_id", "vote", "created_at", "updated_at") SELECT "id", "plugin_id", "user_id", "vote", "created_at", "updated_at" FROM `plugin_votes`;--> statement-breakpoint
DROP TABLE `plugin_votes`;--> statement-breakpoint
DROP TABLE `plugin_versions`;--> statement-breakpoint
DROP TABLE `plugins`;--> statement-breakpoint
ALTER TABLE `__new_plugins` RENAME TO `plugins`;--> statement-breakpoint
ALTER TABLE `__new_plugin_versions` RENAME TO `plugin_versions`;--> statement-breakpoint
ALTER TABLE `__new_plugin_votes` RENAME TO `plugin_votes`;--> statement-breakpoint
CREATE INDEX `plugins_author_id_idx` ON `plugins` (`author_id`);--> statement-breakpoint
CREATE INDEX `plugins_game_id_idx` ON `plugins` (`game_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_versions_content_hash_unique` ON `plugin_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_versions_plugin_id_semver_idx` ON `plugin_versions` (`plugin_id`,`semver`);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_votes_plugin_id_user_id_idx` ON `plugin_votes` (`plugin_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `plugin_votes_plugin_id_idx` ON `plugin_votes` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `plugin_votes_user_id_idx` ON `plugin_votes` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_clothes` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`author_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`latest_semver` text,
	`latest_version_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_clothes`("id", "game_id", "author_id", "slug", "title", "latest_semver", "latest_version_id", "created_at", "updated_at") SELECT "id", "game_id", "author_id", "slug", "title", "latest_semver", "latest_version_id", "created_at", "updated_at" FROM `clothes`;--> statement-breakpoint
CREATE TABLE `__new_clothes_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`clothes_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`preview_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`clothes_id`) REFERENCES `__new_clothes`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_clothes_versions`("id", "clothes_id", "semver", "notes", "content_hash", "original_path", "preview_path", "summary_json", "created_at") SELECT "id", "clothes_id", "semver", "notes", "content_hash", "original_path", "preview_path", "summary_json", "created_at" FROM `clothes_versions`;--> statement-breakpoint
CREATE TABLE `__new_clothes_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`clothes_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`clothes_id`) REFERENCES `__new_clothes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_clothes_votes`("id", "clothes_id", "user_id", "vote", "created_at", "updated_at") SELECT "id", "clothes_id", "user_id", "vote", "created_at", "updated_at" FROM `clothes_votes`;--> statement-breakpoint
DROP TABLE `clothes_votes`;--> statement-breakpoint
DROP TABLE `clothes_versions`;--> statement-breakpoint
DROP TABLE `clothes`;--> statement-breakpoint
ALTER TABLE `__new_clothes` RENAME TO `clothes`;--> statement-breakpoint
ALTER TABLE `__new_clothes_versions` RENAME TO `clothes_versions`;--> statement-breakpoint
ALTER TABLE `__new_clothes_votes` RENAME TO `clothes_votes`;--> statement-breakpoint
CREATE INDEX `clothes_author_id_idx` ON `clothes` (`author_id`);--> statement-breakpoint
CREATE INDEX `clothes_game_id_idx` ON `clothes` (`game_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `clothes_versions_content_hash_unique` ON `clothes_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `clothes_versions_clothes_id_semver_idx` ON `clothes_versions` (`clothes_id`,`semver`);--> statement-breakpoint
CREATE UNIQUE INDEX `clothes_votes_clothes_id_user_id_idx` ON `clothes_votes` (`clothes_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `clothes_votes_clothes_id_idx` ON `clothes_votes` (`clothes_id`);--> statement-breakpoint
CREATE INDEX `clothes_votes_user_id_idx` ON `clothes_votes` (`user_id`);
