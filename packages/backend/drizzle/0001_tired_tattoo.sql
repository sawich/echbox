CREATE TABLE `card_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `character_cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_votes_card_id_user_id_idx` ON `card_votes` (`card_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `card_votes_card_id_idx` ON `card_votes` (`card_id`);--> statement-breakpoint
CREATE INDEX `card_votes_user_id_idx` ON `card_votes` (`user_id`);