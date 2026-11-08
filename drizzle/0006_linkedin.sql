CREATE TABLE `board_lookups` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ats` text,
	`slug` text,
	`checked_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `companies` ADD `discovered_from` text;