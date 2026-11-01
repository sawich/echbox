CREATE TABLE `scene_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`version` integer NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`preview_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scene_versions_content_hash_unique` ON `scene_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `scene_versions_scene_id_version_idx` ON `scene_versions` (`scene_id`,`version`);--> statement-breakpoint
CREATE TABLE `scene_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scene_votes_scene_id_user_id_idx` ON `scene_votes` (`scene_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `scene_votes_scene_id_idx` ON `scene_votes` (`scene_id`);--> statement-breakpoint
CREATE INDEX `scene_votes_user_id_idx` ON `scene_votes` (`user_id`);--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`latest_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `scenes_author_id_idx` ON `scenes` (`author_id`);