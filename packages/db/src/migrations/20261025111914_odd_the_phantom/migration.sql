CREATE TABLE `study_checks` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`session_id` text,
	`plan_node_id` text NOT NULL,
	`kind` text NOT NULL,
	`prompt` text NOT NULL,
	`answer` text,
	`rubric` text,
	`score` real,
	`max_score` real NOT NULL,
	`passed` integer,
	`graded_by` text,
	`feedback` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_study_checks_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_study_checks_goal_id_goals_id_fk` FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_study_checks_session_id_study_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `study_sessions`(`id`) ON UPDATE CASCADE ON DELETE SET NULL,
	CONSTRAINT `fk_study_checks_plan_node_id_study_plan_nodes_id_fk` FOREIGN KEY (`plan_node_id`) REFERENCES `study_plan_nodes`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `study_goal_configs` (
	`goal_id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`target_at` text NOT NULL,
	`daily_minutes` integer NOT NULL,
	`timezone` text NOT NULL,
	`config_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_study_goal_configs_goal_id_goals_id_fk` FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_study_goal_configs_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `study_mastery` (
	`id` text PRIMARY KEY,
	`goal_id` text NOT NULL,
	`plan_node_id` text NOT NULL,
	`score` real NOT NULL,
	`confidence` real NOT NULL,
	`attempts` integer NOT NULL,
	`last_score` real,
	`last_assessed_at` text,
	`next_review_at` text,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_study_mastery_goal_id_goals_id_fk` FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_study_mastery_plan_node_id_study_plan_nodes_id_fk` FOREIGN KEY (`plan_node_id`) REFERENCES `study_plan_nodes`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `study_plan_nodes` (
	`id` text PRIMARY KEY,
	`plan_id` text NOT NULL,
	`parent_id` text,
	`kind` text NOT NULL,
	`order` integer NOT NULL,
	`title` text NOT NULL,
	`objective` text,
	`what_text` text,
	`how_text` text,
	`resources_json` text NOT NULL,
	`estimated_minutes` integer NOT NULL,
	`weight` real NOT NULL,
	`paper` text NOT NULL,
	`syllabus_refs_json` text NOT NULL,
	`prerequisites_json` text NOT NULL,
	`check_specs_json` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_study_plan_nodes_plan_id_study_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `study_plans`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `study_plans` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`template_id` text NOT NULL,
	`diagnostics_json` text NOT NULL,
	`created_at` text NOT NULL,
	`activated_at` text,
	CONSTRAINT `fk_study_plans_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_study_plans_goal_id_goals_id_fk` FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `study_sessions` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`plan_node_id` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`timezone` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`status` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`actual_minutes` integer,
	`rescheduled_from` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_study_sessions_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_study_sessions_goal_id_goals_id_fk` FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_study_sessions_plan_node_id_study_plan_nodes_id_fk` FOREIGN KEY (`plan_node_id`) REFERENCES `study_plan_nodes`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `study_checks_goal_created_idx` ON `study_checks` (`goal_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `study_checks_node_idx` ON `study_checks` (`plan_node_id`);--> statement-breakpoint
CREATE INDEX `study_checks_session_idx` ON `study_checks` (`session_id`);--> statement-breakpoint
CREATE INDEX `study_goal_configs_profile_idx` ON `study_goal_configs` (`profile_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `study_mastery_goal_node_idx` ON `study_mastery` (`goal_id`,`plan_node_id`);--> statement-breakpoint
CREATE INDEX `study_mastery_goal_review_idx` ON `study_mastery` (`goal_id`,`next_review_at`);--> statement-breakpoint
CREATE INDEX `study_plan_nodes_plan_order_idx` ON `study_plan_nodes` (`plan_id`,`order`);--> statement-breakpoint
CREATE INDEX `study_plan_nodes_parent_idx` ON `study_plan_nodes` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `study_plans_goal_version_idx` ON `study_plans` (`goal_id`,`version`);--> statement-breakpoint
CREATE INDEX `study_plans_profile_status_idx` ON `study_plans` (`profile_id`,`status`);--> statement-breakpoint
CREATE INDEX `study_plans_goal_status_idx` ON `study_plans` (`goal_id`,`status`);--> statement-breakpoint
CREATE INDEX `study_sessions_profile_date_idx` ON `study_sessions` (`profile_id`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `study_sessions_goal_status_idx` ON `study_sessions` (`goal_id`,`status`);--> statement-breakpoint
CREATE INDEX `study_sessions_node_idx` ON `study_sessions` (`plan_node_id`);