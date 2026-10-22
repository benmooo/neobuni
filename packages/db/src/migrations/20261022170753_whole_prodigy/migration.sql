CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `action_authorizations` (
	`id` text PRIMARY KEY,
	`proposal_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`mode` text NOT NULL,
	`granted_by` text NOT NULL,
	`constraints_json` text NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_action_authorizations_proposal_id_action_proposals_id_fk` FOREIGN KEY (`proposal_id`) REFERENCES `action_proposals`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_action_authorizations_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `action_proposals` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`goal_id` text,
	`decision_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`expected_outcome` text NOT NULL,
	`reversibility` text NOT NULL,
	`required_authority` text NOT NULL,
	`input_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_action_proposals_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_action_proposals_goal_id_goals_id_fk` FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE CASCADE ON DELETE SET NULL,
	CONSTRAINT `fk_action_proposals_decision_id_decisions_id_fk` FOREIGN KEY (`decision_id`) REFERENCES `decisions`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `action_runs` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`authorization_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`input_json` text NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 1 NOT NULL,
	`lease_owner` text,
	`lease_expires_at` text,
	`checkpoint_json` text,
	`receipt_json` text,
	`result_json` text,
	`error_json` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_action_runs_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_action_runs_proposal_id_action_proposals_id_fk` FOREIGN KEY (`proposal_id`) REFERENCES `action_proposals`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_action_runs_authorization_id_action_authorizations_id_fk` FOREIGN KEY (`authorization_id`) REFERENCES `action_authorizations`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `agent_configs` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`soul_config_id` text,
	`ai_name` text NOT NULL,
	`avatar_uri` text,
	`user_name` text NOT NULL,
	`user_persona` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_agent_configs_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_agent_configs_soul_config_id_soul_configs_id_fk` FOREIGN KEY (`soul_config_id`) REFERENCES `soul_configs`(`id`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `commitments` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`goal_id` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`due_at` text,
	`evidence_ids_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_commitments_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_commitments_goal_id_goals_id_fk` FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`title` text NOT NULL,
	`model_key` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_conversations_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `decision_candidates` (
	`id` text PRIMARY KEY,
	`decision_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`rationale` text NOT NULL,
	`reversibility` text NOT NULL,
	`authority` text NOT NULL,
	`eligible` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_decision_candidates_decision_id_decisions_id_fk` FOREIGN KEY (`decision_id`) REFERENCES `decisions`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `decision_feedback` (
	`id` text PRIMARY KEY,
	`decision_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`candidate_id` text,
	`note` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_decision_feedback_decision_id_decisions_id_fk` FOREIGN KEY (`decision_id`) REFERENCES `decisions`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_decision_feedback_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `decision_judgments` (
	`id` text PRIMARY KEY,
	`decision_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_version` text NOT NULL,
	`question_id` text NOT NULL,
	`kind` text NOT NULL,
	`selected_value_json` text NOT NULL,
	`probabilities_json` text NOT NULL,
	`confidence` real,
	`latency_ms` integer,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_decision_judgments_decision_id_decisions_id_fk` FOREIGN KEY (`decision_id`) REFERENCES `decisions`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`goal_id` text,
	`kind` text NOT NULL,
	`trigger` text NOT NULL,
	`state_fingerprint` text NOT NULL,
	`route` text NOT NULL,
	`permitted` integer NOT NULL,
	`policy_version` text NOT NULL,
	`policy_reasons_json` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_decisions_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_decisions_goal_id_goals_id_fk` FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `digest_anchors` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`conversation_id` text NOT NULL UNIQUE,
	`last_message_id` text NOT NULL,
	`last_message_ts` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_digest_anchors_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_digest_anchors_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_digest_anchors_last_message_id_messages_id_fk` FOREIGN KEY (`last_message_id`) REFERENCES `messages`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_events_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `external_conversation_bindings` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`platform` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_key` text NOT NULL,
	`conversation_id` text NOT NULL,
	`last_inbound_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_external_conversation_bindings_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_external_conversation_bindings_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `external_event_receipts` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`platform` text NOT NULL,
	`event_id` text NOT NULL,
	`received_at` text NOT NULL,
	CONSTRAINT `fk_external_event_receipts_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`title` text NOT NULL,
	`desired_outcome` text NOT NULL,
	`status` text NOT NULL,
	`horizon` text NOT NULL,
	`success_criteria_json` text NOT NULL,
	`constraints_json` text NOT NULL,
	`autonomy_mode` text NOT NULL,
	`plan_version` integer DEFAULT 0 NOT NULL,
	`next_review_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_goals_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY,
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`token_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_knowledge_chunks_document_id_knowledge_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `knowledge_documents`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `knowledge_documents` (
	`id` text PRIMARY KEY,
	`profile_id` text,
	`scope` text DEFAULT 'profile' NOT NULL,
	`title` text NOT NULL,
	`source_type` text NOT NULL,
	`source_uri` text,
	`trust_level` text DEFAULT 'imported' NOT NULL,
	`checksum` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_knowledge_documents_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `knowledge_facts` (
	`id` text PRIMARY KEY,
	`document_id` text NOT NULL,
	`chunk_id` text,
	`subject` text NOT NULL,
	`predicate` text NOT NULL,
	`object` text NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_knowledge_facts_document_id_knowledge_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `knowledge_documents`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_knowledge_facts_chunk_id_knowledge_chunks_id_fk` FOREIGN KEY (`chunk_id`) REFERENCES `knowledge_chunks`(`id`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`conversation_id` text,
	`episode_id` text,
	`content` text NOT NULL,
	`type` text NOT NULL,
	`memory_class` text DEFAULT 'episodic' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`keywords_json` text NOT NULL,
	`importance` real NOT NULL,
	`embedding_version` text,
	`source_kind` text DEFAULT 'digest' NOT NULL,
	`source_start_ts` text,
	`source_end_ts` text,
	`unresolved` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_memories_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_memories_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `memory_conflicts` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`conversation_id` text,
	`turn_id` text,
	`operation` text NOT NULL,
	`conflict_kind` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reason` text NOT NULL,
	`existing_memory_id` text NOT NULL,
	`subject_memory_id` text,
	`proposal_json` text NOT NULL,
	`resolution_json` text,
	`resolved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_memory_conflicts_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_memory_conflicts_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE CASCADE ON DELETE SET NULL,
	CONSTRAINT `fk_memory_conflicts_existing_memory_id_memories_id_fk` FOREIGN KEY (`existing_memory_id`) REFERENCES `memories`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_memory_conflicts_subject_memory_id_memories_id_fk` FOREIGN KEY (`subject_memory_id`) REFERENCES `memories`(`id`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `memory_graph_edges` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`from_node_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`to_node_id` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`valid_from_ts` text,
	`valid_to_ts` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_memory_graph_edges_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_memory_graph_edges_from_node_id_memory_graph_nodes_id_fk` FOREIGN KEY (`from_node_id`) REFERENCES `memory_graph_nodes`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_memory_graph_edges_to_node_id_memory_graph_nodes_id_fk` FOREIGN KEY (`to_node_id`) REFERENCES `memory_graph_nodes`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `memory_graph_nodes` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`canonical_name` text NOT NULL,
	`summary` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`payload_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_memory_graph_nodes_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `memory_graph_sources` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`evidence_text` text NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_memory_graph_sources_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY,
	`conversation_id` text NOT NULL,
	`turn_id` text,
	`role` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_messages_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_messages_turn_id_runtime_turns_id_fk` FOREIGN KEY (`turn_id`) REFERENCES `runtime_turns`(`id`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `messaging_integrations` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`platform` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`bot_token` text DEFAULT '' NOT NULL,
	`app_id` text,
	`app_secret` text,
	`public_key` text,
	`webhook_secret` text,
	`base_url` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_messaging_integrations_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `messaging_targets` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`platform` text NOT NULL,
	`alias` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_messaging_targets_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY,
	`owner_user_id` text,
	`name` text NOT NULL,
	`kind` text DEFAULT 'personal' NOT NULL,
	`timezone` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_profiles_owner_user_id_user_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `provider_configs` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`slot` text NOT NULL,
	`provider` text NOT NULL,
	`protocol` text DEFAULT '' NOT NULL,
	`model` text NOT NULL,
	`api_key` text NOT NULL,
	`base_url` text NOT NULL,
	`enabled` integer NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_provider_configs_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `runtime_spans` (
	`id` text PRIMARY KEY,
	`turn_id` text NOT NULL,
	`conversation_id` text,
	`stage` text NOT NULL,
	`seq` integer NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`duration_ms` integer,
	`input_json` text,
	`output_json` text,
	`error_json` text,
	CONSTRAINT `fk_runtime_spans_turn_id_runtime_turns_id_fk` FOREIGN KEY (`turn_id`) REFERENCES `runtime_turns`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_runtime_spans_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `runtime_turns` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`conversation_id` text,
	`execution_source` text DEFAULT 'chat' NOT NULL,
	`task_run_id` text,
	`request_message_id` text,
	`response_message_id` text,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`duration_ms` integer,
	`provider_key` text NOT NULL,
	`model_key` text NOT NULL,
	`protective_level` integer,
	`primary_stance` text,
	`memory_count` integer DEFAULT 0 NOT NULL,
	`memory_recall_strategy` text,
	`pre_recall_count` integer DEFAULT 0 NOT NULL,
	`tool_call_count` integer DEFAULT 0 NOT NULL,
	`had_tool_failures` integer DEFAULT 0 NOT NULL,
	`had_tool_recall` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_runtime_turns_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_runtime_turns_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_runtime_turns_task_run_id_task_runs_id_fk` FOREIGN KEY (`task_run_id`) REFERENCES `task_runs`(`id`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`trigger_at` text,
	`cron_expr` text,
	`timezone` text NOT NULL,
	`status` text NOT NULL,
	`last_triggered_at` text,
	`delivered_at` text,
	`last_materialized_at` text,
	`metadata_json` text NOT NULL,
	`blueprint_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_schedules_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`active_profile_id` text,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `soul_configs` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`version` integer NOT NULL,
	`config_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_soul_configs_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `task_runs` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`schedule_id` text NOT NULL,
	`status` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`prompt_snapshot` text NOT NULL,
	`tool_policy_snapshot_json` text,
	`input_snapshot_json` text,
	`attempt` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`lease_owner` text,
	`lease_expires_at` text,
	`heartbeat_at` text,
	`next_retry_at` text,
	`runtime_turn_id` text,
	`result_json` text,
	`error_json` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_task_runs_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_task_runs_schedule_id_schedules_id_fk` FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `action_authorizations_proposal_idx` ON `action_authorizations` (`proposal_id`);--> statement-breakpoint
CREATE INDEX `action_authorizations_profile_created_idx` ON `action_authorizations` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `action_proposals_profile_created_idx` ON `action_proposals` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `action_proposals_decision_idx` ON `action_proposals` (`decision_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `action_runs_proposal_unq` ON `action_runs` (`proposal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `action_runs_idempotency_key_unq` ON `action_runs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `action_runs_profile_status_idx` ON `action_runs` (`profile_id`,`status`);--> statement-breakpoint
CREATE INDEX `action_runs_status_lease_idx` ON `action_runs` (`status`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `commitments_profile_status_idx` ON `commitments` (`profile_id`,`status`);--> statement-breakpoint
CREATE INDEX `commitments_goal_status_idx` ON `commitments` (`goal_id`,`status`);--> statement-breakpoint
CREATE INDEX `commitments_profile_due_idx` ON `commitments` (`profile_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `decision_candidates_decision_idx` ON `decision_candidates` (`decision_id`);--> statement-breakpoint
CREATE INDEX `decision_feedback_decision_idx` ON `decision_feedback` (`decision_id`);--> statement-breakpoint
CREATE INDEX `decision_feedback_profile_created_idx` ON `decision_feedback` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `decision_judgments_decision_idx` ON `decision_judgments` (`decision_id`);--> statement-breakpoint
CREATE INDEX `decisions_profile_created_idx` ON `decisions` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `decisions_goal_created_idx` ON `decisions` (`goal_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_conversation_bindings_scope_idx` ON `external_conversation_bindings` (`profile_id`,`platform`,`scope_type`,`scope_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_event_receipts_event_idx` ON `external_event_receipts` (`profile_id`,`platform`,`event_id`);--> statement-breakpoint
CREATE INDEX `goals_profile_status_idx` ON `goals` (`profile_id`,`status`);--> statement-breakpoint
CREATE INDEX `goals_profile_review_idx` ON `goals` (`profile_id`,`next_review_at`);--> statement-breakpoint
CREATE INDEX `memory_conflicts_profile_status_idx` ON `memory_conflicts` (`profile_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `messaging_integrations_profile_platform_idx` ON `messaging_integrations` (`profile_id`,`platform`);--> statement-breakpoint
CREATE UNIQUE INDEX `messaging_targets_profile_platform_alias_idx` ON `messaging_targets` (`profile_id`,`platform`,`alias`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_runs_schedule_scheduled_for_unq` ON `task_runs` (`schedule_id`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `task_runs_profile_status_idx` ON `task_runs` (`profile_id`,`status`);--> statement-breakpoint
CREATE INDEX `task_runs_status_retry_idx` ON `task_runs` (`status`,`next_retry_at`);--> statement-breakpoint
CREATE INDEX `task_runs_schedule_created_idx` ON `task_runs` (`schedule_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);