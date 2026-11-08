CREATE TABLE `cover_letters` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
