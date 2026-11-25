CREATE TABLE `access_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`student_id` integer,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`lesson_id` integer NOT NULL,
	`status` text NOT NULL,
	`attended` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_student_lesson_unique` ON `bookings` (`student_id`,`lesson_id`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`public_place` text NOT NULL,
	`private_place` text DEFAULT '' NOT NULL,
	`objective` text NOT NULL,
	`private_brief` text DEFAULT '' NOT NULL,
	`capacity` integer DEFAULT 5 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`invite_hash` text,
	`invite_expires_at` text,
	`password_hash` text,
	`password_salt` text,
	`active` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_phone_unique` ON `students` (`phone`);