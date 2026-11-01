CREATE TABLE `auth_claims` (
	`token` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE TABLE `oauth_pending` (
	`state` text PRIMARY KEY NOT NULL,
	`code_verifier` text NOT NULL,
	`desktop` integer NOT NULL,
	`expires_at` text NOT NULL
);
