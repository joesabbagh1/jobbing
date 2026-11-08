CREATE TABLE `applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`applied_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`via` text DEFAULT 'company site' NOT NULL,
	`notes` text,
	`follow_up_on` text,
	`cv` text NOT NULL,
	`letter` text,
	`cv_pdf` blob NOT NULL,
	`cv_filename` text NOT NULL,
	`letter_pdf` blob,
	`letter_filename` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `applications_job_id_unique` ON `applications` (`job_id`);