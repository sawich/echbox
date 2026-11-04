-- Telegram proxy blob store + nullable original_path on version tables.
CREATE TABLE IF NOT EXISTS `content_blobs` (
	`content_hash` text PRIMARY KEY NOT NULL,
	`original_byte_size` integer NOT NULL,
	`archive_byte_size` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `content_blob_chunks` (
	`content_hash` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`telegram_file_id` text NOT NULL,
	`telegram_message_id` text NOT NULL,
	`telegram_chat_id` text NOT NULL,
	PRIMARY KEY(`content_hash`, `chunk_index`),
	FOREIGN KEY (`content_hash`) REFERENCES `content_blobs`(`content_hash`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `__new_character_card_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text,
	`preview_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `character_cards`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_character_card_versions`("id", "card_id", "semver", "notes", "content_hash", "original_path", "preview_path", "summary_json", "created_at") SELECT "id", "card_id", "semver", "notes", "content_hash", "original_path", "preview_path", "summary_json", "created_at" FROM `character_card_versions`;--> statement-breakpoint
DROP TABLE `character_card_versions`;--> statement-breakpoint
ALTER TABLE `__new_character_card_versions` RENAME TO `character_card_versions`;--> statement-breakpoint
CREATE UNIQUE INDEX `character_card_versions_content_hash_unique` ON `character_card_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `character_card_versions_card_id_semver_idx` ON `character_card_versions` (`card_id`,`semver`);--> statement-breakpoint
CREATE TABLE `__new_scene_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text,
	`preview_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_scene_versions`("id", "scene_id", "semver", "notes", "content_hash", "original_path", "preview_path", "summary_json", "created_at") SELECT "id", "scene_id", "semver", "notes", "content_hash", "original_path", "preview_path", "summary_json", "created_at" FROM `scene_versions`;--> statement-breakpoint
DROP TABLE `scene_versions`;--> statement-breakpoint
ALTER TABLE `__new_scene_versions` RENAME TO `scene_versions`;--> statement-breakpoint
CREATE UNIQUE INDEX `scene_versions_content_hash_unique` ON `scene_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `scene_versions_scene_id_semver_idx` ON `scene_versions` (`scene_id`,`semver`);--> statement-breakpoint
CREATE TABLE `__new_clothes_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`clothes_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text,
	`preview_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`clothes_id`) REFERENCES `clothes`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_clothes_versions`("id", "clothes_id", "semver", "notes", "content_hash", "original_path", "preview_path", "summary_json", "created_at") SELECT "id", "clothes_id", "semver", "notes", "content_hash", "original_path", "preview_path", "summary_json", "created_at" FROM `clothes_versions`;--> statement-breakpoint
DROP TABLE `clothes_versions`;--> statement-breakpoint
ALTER TABLE `__new_clothes_versions` RENAME TO `clothes_versions`;--> statement-breakpoint
CREATE UNIQUE INDEX `clothes_versions_content_hash_unique` ON `clothes_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `clothes_versions_clothes_id_semver_idx` ON `clothes_versions` (`clothes_id`,`semver`);--> statement-breakpoint
CREATE TABLE `__new_softmod_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`softmod_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`softmod_id`) REFERENCES `softmods`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_softmod_versions`("id", "softmod_id", "semver", "notes", "content_hash", "original_path", "summary_json", "created_at") SELECT "id", "softmod_id", "semver", "notes", "content_hash", "original_path", "summary_json", "created_at" FROM `softmod_versions`;--> statement-breakpoint
DROP TABLE `softmod_versions`;--> statement-breakpoint
ALTER TABLE `__new_softmod_versions` RENAME TO `softmod_versions`;--> statement-breakpoint
CREATE UNIQUE INDEX `softmod_versions_content_hash_unique` ON `softmod_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `softmod_versions_softmod_id_semver_idx` ON `softmod_versions` (`softmod_id`,`semver`);--> statement-breakpoint
CREATE TABLE `__new_plugin_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_plugin_versions`("id", "plugin_id", "semver", "notes", "content_hash", "original_path", "summary_json", "created_at") SELECT "id", "plugin_id", "semver", "notes", "content_hash", "original_path", "summary_json", "created_at" FROM `plugin_versions`;--> statement-breakpoint
DROP TABLE `plugin_versions`;--> statement-breakpoint
ALTER TABLE `__new_plugin_versions` RENAME TO `plugin_versions`;--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_versions_content_hash_unique` ON `plugin_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_versions_plugin_id_semver_idx` ON `plugin_versions` (`plugin_id`,`semver`);
