CREATE TABLE `clothes` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`author_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`latest_semver` text,
	`latest_version_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `clothes_author_id_idx` ON `clothes` (`author_id`);--> statement-breakpoint
CREATE INDEX `clothes_game_id_idx` ON `clothes` (`game_id`);--> statement-breakpoint
CREATE TABLE `clothes_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`clothes_id` text NOT NULL,
	`semver` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`preview_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`clothes_id`) REFERENCES `clothes`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `clothes_versions_content_hash_unique` ON `clothes_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `clothes_versions_clothes_id_semver_idx` ON `clothes_versions` (`clothes_id`,`semver`);--> statement-breakpoint
CREATE TABLE `clothes_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`clothes_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`clothes_id`) REFERENCES `clothes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `clothes_votes_clothes_id_user_id_idx` ON `clothes_votes` (`clothes_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `clothes_votes_clothes_id_idx` ON `clothes_votes` (`clothes_id`);--> statement-breakpoint
CREATE INDEX `clothes_votes_user_id_idx` ON `clothes_votes` (`user_id`);
