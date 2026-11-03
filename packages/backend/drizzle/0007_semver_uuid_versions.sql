-- Recreate content tables: integer versions → semver + uuid version ids.
DROP TABLE IF EXISTS `card_votes`;--> statement-breakpoint
DROP TABLE IF EXISTS `character_card_versions`;--> statement-breakpoint
DROP TABLE IF EXISTS `character_cards`;--> statement-breakpoint
DROP TABLE IF EXISTS `scene_votes`;--> statement-breakpoint
DROP TABLE IF EXISTS `scene_versions`;--> statement-breakpoint
DROP TABLE IF EXISTS `scenes`;--> statement-breakpoint
DROP TABLE IF EXISTS `plugin_votes`;--> statement-breakpoint
DROP TABLE IF EXISTS `plugin_versions`;--> statement-breakpoint
DROP TABLE IF EXISTS `plugins`;--> statement-breakpoint
DROP TABLE IF EXISTS `softmod_votes`;--> statement-breakpoint
DROP TABLE IF EXISTS `softmod_versions`;--> statement-breakpoint
DROP TABLE IF EXISTS `softmods`;--> statement-breakpoint
CREATE TABLE `character_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`author_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`latest_semver` text NOT NULL,
	`latest_version_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `character_cards_author_id_idx` ON `character_cards` (`author_id`);--> statement-breakpoint
CREATE INDEX `character_cards_game_id_idx` ON `character_cards` (`game_id`);--> statement-breakpoint
CREATE TABLE `character_card_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`preview_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `character_cards`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `character_card_versions_content_hash_unique` ON `character_card_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `character_card_versions_card_id_semver_idx` ON `character_card_versions` (`card_id`,`semver`);--> statement-breakpoint
CREATE TABLE `card_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `character_cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `card_votes_card_id_user_id_idx` ON `card_votes` (`card_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `card_votes_card_id_idx` ON `card_votes` (`card_id`);--> statement-breakpoint
CREATE INDEX `card_votes_user_id_idx` ON `card_votes` (`user_id`);--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`author_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`latest_semver` text NOT NULL,
	`latest_version_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `scenes_author_id_idx` ON `scenes` (`author_id`);--> statement-breakpoint
CREATE INDEX `scenes_game_id_idx` ON `scenes` (`game_id`);--> statement-breakpoint
CREATE TABLE `scene_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`preview_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `scene_versions_content_hash_unique` ON `scene_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `scene_versions_scene_id_semver_idx` ON `scene_versions` (`scene_id`,`semver`);--> statement-breakpoint
CREATE TABLE `scene_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `scene_votes_scene_id_user_id_idx` ON `scene_votes` (`scene_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `scene_votes_scene_id_idx` ON `scene_votes` (`scene_id`);--> statement-breakpoint
CREATE INDEX `scene_votes_user_id_idx` ON `scene_votes` (`user_id`);--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`latest_semver` text NOT NULL,
	`latest_version_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `plugins_author_id_idx` ON `plugins` (`author_id`);--> statement-breakpoint
CREATE INDEX `plugins_game_id_idx` ON `plugins` (`game_id`);--> statement-breakpoint
CREATE TABLE `plugin_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_versions_content_hash_unique` ON `plugin_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_versions_plugin_id_semver_idx` ON `plugin_versions` (`plugin_id`,`semver`);--> statement-breakpoint
CREATE TABLE `plugin_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_votes_plugin_id_user_id_idx` ON `plugin_votes` (`plugin_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `plugin_votes_plugin_id_idx` ON `plugin_votes` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `plugin_votes_user_id_idx` ON `plugin_votes` (`user_id`);--> statement-breakpoint
CREATE TABLE `softmods` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`mod_author` text,
	`description` text NOT NULL,
	`website` text,
	`latest_semver` text NOT NULL,
	`latest_version_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `softmods_author_id_idx` ON `softmods` (`author_id`);--> statement-breakpoint
CREATE INDEX `softmods_game_id_idx` ON `softmods` (`game_id`);--> statement-breakpoint
CREATE TABLE `softmod_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`softmod_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`softmod_id`) REFERENCES `softmods`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `softmod_versions_content_hash_unique` ON `softmod_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `softmod_versions_softmod_id_semver_idx` ON `softmod_versions` (`softmod_id`,`semver`);--> statement-breakpoint
CREATE TABLE `softmod_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`softmod_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`softmod_id`) REFERENCES `softmods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `softmod_votes_softmod_id_user_id_idx` ON `softmod_votes` (`softmod_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `softmod_votes_softmod_id_idx` ON `softmod_votes` (`softmod_id`);--> statement-breakpoint
CREATE INDEX `softmod_votes_user_id_idx` ON `softmod_votes` (`user_id`);
