CREATE TABLE `places` (
	`query` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`lat` real,
	`lng` real,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
