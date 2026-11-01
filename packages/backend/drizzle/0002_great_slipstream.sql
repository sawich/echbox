CREATE TABLE `plugin_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`version` integer NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_versions_content_hash_unique` ON `plugin_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_versions_plugin_id_version_idx` ON `plugin_versions` (`plugin_id`,`version`);--> statement-breakpoint
CREATE TABLE `plugin_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_votes_plugin_id_user_id_idx` ON `plugin_votes` (`plugin_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `plugin_votes_plugin_id_idx` ON `plugin_votes` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `plugin_votes_user_id_idx` ON `plugin_votes` (`user_id`);--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`latest_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plugins_author_id_idx` ON `plugins` (`author_id`);--> statement-breakpoint
CREATE TABLE `softmod_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`softmod_id` text NOT NULL,
	`version` integer NOT NULL,
	`package_version` text NOT NULL,
	`notes` text,
	`content_hash` text NOT NULL,
	`original_path` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`softmod_id`) REFERENCES `softmods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `softmod_versions_content_hash_unique` ON `softmod_versions` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `softmod_versions_softmod_id_version_idx` ON `softmod_versions` (`softmod_id`,`version`);--> statement-breakpoint
CREATE TABLE `softmod_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`softmod_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`softmod_id`) REFERENCES `softmods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `softmod_votes_softmod_id_user_id_idx` ON `softmod_votes` (`softmod_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `softmod_votes_softmod_id_idx` ON `softmod_votes` (`softmod_id`);--> statement-breakpoint
CREATE INDEX `softmod_votes_user_id_idx` ON `softmod_votes` (`user_id`);--> statement-breakpoint
CREATE TABLE `softmods` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`mod_author` text,
	`description` text NOT NULL,
	`website` text,
	`latest_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `softmods_author_id_idx` ON `softmods` (`author_id`);