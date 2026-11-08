CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`ats` text NOT NULL,
	`slug` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_checked_at` text,
	`last_job_count` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_ats_slug` ON `companies` (`ats`,`slug`);--> statement-breakpoint
CREATE TABLE `rejected_postings` (
	`url` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`match_score` real,
	`summary` text,
	`rejected_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `jobs` ADD `origin` text;--> statement-breakpoint
UPDATE `jobs` SET `origin` = 'airtable' WHERE `airtable_id` IS NOT NULL;
