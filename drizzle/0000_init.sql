CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`airtable_id` text,
	`company` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`source` text,
	`description` text,
	`posted_at` text,
	`extra` text,
	`status` text DEFAULT 'new' NOT NULL,
	`match_score` real,
	`analysis` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_url_unique` ON `jobs` (`url`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_airtable_id_unique` ON `jobs` (`airtable_id`);