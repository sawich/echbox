-- Wipe seed/library content so NOT NULL game_id can be added.
DELETE FROM `card_votes`;--> statement-breakpoint
DELETE FROM `character_card_versions`;--> statement-breakpoint
DELETE FROM `character_cards`;--> statement-breakpoint
DELETE FROM `scene_votes`;--> statement-breakpoint
DELETE FROM `scene_versions`;--> statement-breakpoint
DELETE FROM `scenes`;--> statement-breakpoint
DELETE FROM `plugin_votes`;--> statement-breakpoint
DELETE FROM `plugin_versions`;--> statement-breakpoint
DELETE FROM `plugins`;--> statement-breakpoint
DELETE FROM `softmod_votes`;--> statement-breakpoint
DELETE FROM `softmod_versions`;--> statement-breakpoint
DELETE FROM `softmods`;--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `games_slug_unique` ON `games` (`slug`);--> statement-breakpoint
CREATE INDEX `games_created_by_user_id_idx` ON `games` (`created_by_user_id`);--> statement-breakpoint
ALTER TABLE `character_cards` ADD `game_id` text NOT NULL DEFAULT '' REFERENCES games(id);--> statement-breakpoint
CREATE INDEX `character_cards_game_id_idx` ON `character_cards` (`game_id`);--> statement-breakpoint
ALTER TABLE `plugins` ADD `game_id` text NOT NULL DEFAULT '' REFERENCES games(id);--> statement-breakpoint
CREATE INDEX `plugins_game_id_idx` ON `plugins` (`game_id`);--> statement-breakpoint
ALTER TABLE `scenes` ADD `game_id` text NOT NULL DEFAULT '' REFERENCES games(id);--> statement-breakpoint
CREATE INDEX `scenes_game_id_idx` ON `scenes` (`game_id`);--> statement-breakpoint
ALTER TABLE `softmods` ADD `game_id` text NOT NULL DEFAULT '' REFERENCES games(id);--> statement-breakpoint
CREATE INDEX `softmods_game_id_idx` ON `softmods` (`game_id`);
