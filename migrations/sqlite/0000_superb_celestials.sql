CREATE TABLE `agent_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`message_id` text,
	`agent_name` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text,
	`duration_ms` integer,
	`input_data` text NOT NULL,
	`output_data` text,
	`error` text,
	`parent_trace_id` text,
	`execution_order` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`user_id` text,
	`metadata` text,
	`message_count` integer DEFAULT 0,
	`last_message_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `config_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`environment` text NOT NULL,
	`config_data` text NOT NULL,
	`is_active` integer DEFAULT false,
	`checksum` text,
	`created_by` text,
	`deployed_by` text,
	`created_at` text NOT NULL,
	`activated_at` text
);
--> statement-breakpoint
CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`embedding_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `document_processing_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`user_id` text,
	`status` text NOT NULL,
	`job_type` text NOT NULL,
	`progress` integer DEFAULT 0,
	`total_chunks` integer,
	`processed_chunks` integer DEFAULT 0,
	`error_message` text,
	`metadata` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`content` text NOT NULL,
	`uploaded_at` text NOT NULL,
	`user_id` text
);
--> statement-breakpoint
CREATE TABLE `message_context` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`session_id` text NOT NULL,
	`context_messages` text,
	`token_count` integer NOT NULL,
	`is_context_boundary` integer DEFAULT false,
	`relevance_score` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`sources` text,
	`classification` text,
	`agent_traces` text,
	`execution_time_ms` integer,
	`response_type` text,
	`token_count` integer,
	`context_window_used` integer,
	`sequence_number` integer NOT NULL,
	`parent_message_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `query_analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`user_id` text,
	`query` text NOT NULL,
	`classification` text,
	`execution_time_ms` integer NOT NULL,
	`agent_chain` text,
	`source_documents` text,
	`chunk_count` integer,
	`relevance_score_avg` real,
	`response_type` text,
	`error_message` text,
	`token_usage` text,
	`cache_hit` integer DEFAULT false,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`is_active` integer DEFAULT true,
	`expires_at` text NOT NULL,
	`last_activity_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_sessions_session_token_unique` ON `user_sessions` (`session_token`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`picture` text,
	`locale` text,
	`preferences` text,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`is_active` integer DEFAULT true
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);