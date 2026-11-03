CREATE TABLE `game_content_kinds` (
	`game_id` text NOT NULL,
	`kind` text NOT NULL,
	`rel_path` text,
	PRIMARY KEY(`game_id`, `kind`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_content_kinds_game_id_idx` ON `game_content_kinds` (`game_id`);
