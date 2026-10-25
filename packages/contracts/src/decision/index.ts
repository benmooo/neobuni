import { z } from "zod";

import { idSchema, isoDateTimeSchema } from "../platform/common/base";

const goalStatusSchema = z.enum([
  "draft",
  "active",
  "blocked",
  "paused",
  "completed",
  "abandoned",
]);
const goalHorizonSchema = z.enum(["today", "week", "project", "ongoing"]);
const autonomyModeSchema = z.enum([
  "observe",
  "collaborate",
  "execute_reversible",
  "delegate",
]);
const commitmentKindSchema = z.enum([
  "task",
  "promise",
  "deadline",
  "decision",
  "dependency",
]);
const commitmentStatusSchema = z.enum(["open", "blocked", "done", "cancelled"]);
const commitmentOwnerSchema = z.enum(["user", "buni", "external"]);
const decisionKindSchema = z.enum([
  "memory_retrieval",
  "initiative",
  "next_action",
  "planning_escalation",
]);
const decisionRouteSchema = z.enum([
  "deny",
  "stay_silent",
  "suggest",
  "request_confirmation",
  "execute",
  "use_system_two",
]);
const decisionFeedbackKindSchema = z.enum([
  "accepted",
  "dismissed",
  "deferred",
]);
const actionProposalStatusSchema = z.enum([
  "proposed",
  "authorized",
  "cancelled",
  "completed",
]);
const actionAuthorizationModeSchema = z.enum([
  "deny",
  "suggest",
  "request_confirmation",
  "execute",
]);
const actionAuthorizationGrantorSchema = z.enum(["user", "policy"]);
const actionRunStatusSchema = z.enum([
  "queued",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
const actionReceiptStatusSchema = z.enum([
  "pending",
  "local_confirmed",
  "external_unconfirmed",
  "external_confirmed",
  "reconciliation_required",
]);
const actionRunCheckpointSchema = z.object({
  phase: z.string().trim().min(1).max(128),
  recordedAt: isoDateTimeSchema,
  data: z.record(z.string(), z.unknown()),
});
const actionReceiptSchema = z.object({
  kind: z.string().trim().min(1).max(128),
  status: actionReceiptStatusSchema,
  confirmedAt: isoDateTimeSchema.nullable(),
  evidence: z.record(z.string(), z.unknown()),
});
const actionReversibilitySchema = z.enum([
  "reversible",
  "partially_reversible",
  "irreversible",
]);
const authorityLevelSchema = z.enum([
  "none",
  "suggest",
  "confirmation",
  "scoped_execution",
]);

const successCriterionSchema = z.object({
  id: idSchema,
  description: z.string().trim().min(1).max(2000),
  satisfied: z.boolean(),
});
const goalConstraintSchema = z.object({
  id: idSchema,
  kind: z.string().trim().min(1).max(128),
  description: z.string().trim().min(1).max(2000),
});
const goalSchema = z.object({
  id: idSchema,
  profileId: idSchema,
  title: z.string().trim().min(1).max(500),
  desiredOutcome: z.string().trim().min(1).max(4000),
  status: goalStatusSchema,
  horizon: goalHorizonSchema,
  successCriteria: z.array(successCriterionSchema).max(32),
  constraints: z.array(goalConstraintSchema).max(32),
  autonomyMode: autonomyModeSchema,
  planVersion: z.number().int().nonnegative(),
  nextReviewAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
const commitmentSchema = z.object({
  id: idSchema,
  profileId: idSchema,
  goalId: idSchema.nullable(),
  kind: commitmentKindSchema,
  status: commitmentStatusSchema,
  owner: commitmentOwnerSchema,
  title: z.string().trim().min(1).max(1000),
  dueAt: isoDateTimeSchema.nullable(),
  evidenceIds: z.array(idSchema).max(64),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
const decisionCandidateSchema = z.object({
  id: idSchema,
  kind: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(1000),
  rationale: z.string().trim().min(1).max(4000),
  reversibility: actionReversibilitySchema,
  authority: authorityLevelSchema,
  eligible: z.boolean(),
});
const policyResultSchema = z.object({
  permitted: z.boolean(),
  route: decisionRouteSchema,
  reasons: z.array(z.string().trim().min(1)).max(32),
  policyVersion: z.string().trim().min(1).max(128),
});
const decisionSchema = z.object({
  id: idSchema,
  profileId: idSchema,
  goalId: idSchema.nullable(),
  kind: decisionKindSchema,
  trigger: z.string().trim().min(1).max(128),
  stateFingerprint: z.string().trim().min(1).max(256),
  route: decisionRouteSchema,
  policyResult: policyResultSchema,
  createdAt: isoDateTimeSchema,
});
const decisionFeedbackSchema = z.object({
  id: idSchema,
  decisionId: idSchema,
  profileId: idSchema,
  kind: decisionFeedbackKindSchema,
  candidateId: idSchema.nullable(),
  note: z.string().trim().min(1).max(2000).nullable(),
  createdAt: isoDateTimeSchema,
});
const actionProposalSchema = z.object({
  id: idSchema,
  profileId: idSchema,
  goalId: idSchema.nullable(),
  decisionId: idSchema,
  candidateId: idSchema,
  kind: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(1000),
  expectedOutcome: z.string().trim().min(1).max(4000),
  reversibility: actionReversibilitySchema,
  requiredAuthority: authorityLevelSchema,
  input: z.record(z.string(), z.unknown()),
  status: actionProposalStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
const actionAuthorizationSchema = z.object({
  id: idSchema,
  proposalId: idSchema,
  profileId: idSchema,
  mode: actionAuthorizationModeSchema,
  grantedBy: actionAuthorizationGrantorSchema,
  constraints: z.record(z.string(), z.unknown()),
  expiresAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
const commitmentStatusUpdateActionInputSchema = z.object({
  operation: z.literal("commitment_status_update"),
  commitmentId: idSchema,
  expectedStatus: commitmentStatusSchema,
  nextStatus: commitmentStatusSchema,
});
const telegramMessageSendActionInputSchema = z
  .object({
    operation: z.literal("telegram_message_send"),
    messageKind: z.literal("daily_summary"),
    targetAlias: z.string().trim().min(1).max(120).nullable(),
    targetId: z.string().trim().min(1).max(300).nullable(),
    text: z.string().trim().min(1).max(20_000),
  })
  .superRefine((value, ctx) => {
    if (value.targetAlias !== null || value.targetId !== null) {
      return;
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["targetAlias"],
      message: "A Telegram target alias or target ID is required",
    });
  });
const actionRunInputSchema = z.discriminatedUnion("operation", [
  commitmentStatusUpdateActionInputSchema,
  telegramMessageSendActionInputSchema,
]);
const actionRunSchema = z.object({
  id: idSchema,
  profileId: idSchema,
  proposalId: idSchema,
  authorizationId: idSchema,
  idempotencyKey: z.string().trim().min(1).max(256),
  status: actionRunStatusSchema,
  input: actionRunInputSchema,
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  leaseOwner: z.string().trim().min(1).nullable(),
  leaseExpiresAt: isoDateTimeSchema.nullable(),
  checkpoint: actionRunCheckpointSchema.nullable(),
  receipt: actionReceiptSchema.nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
  error: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});

export {
  actionAuthorizationGrantorSchema,
  actionAuthorizationModeSchema,
  actionAuthorizationSchema,
  actionProposalSchema,
  actionProposalStatusSchema,
  actionReceiptSchema,
  actionReceiptStatusSchema,
  actionReversibilitySchema,
  actionRunCheckpointSchema,
  actionRunInputSchema,
  actionRunSchema,
  actionRunStatusSchema,
  authorityLevelSchema,
  autonomyModeSchema,
  commitmentKindSchema,
  commitmentOwnerSchema,
  commitmentSchema,
  commitmentStatusSchema,
  decisionCandidateSchema,
  decisionFeedbackKindSchema,
  decisionFeedbackSchema,
  decisionKindSchema,
  decisionRouteSchema,
  decisionSchema,
  goalConstraintSchema,
  goalHorizonSchema,
  goalSchema,
  goalStatusSchema,
  policyResultSchema,
  successCriterionSchema,
  telegramMessageSendActionInputSchema,
};
export type Goal = z.infer<typeof goalSchema>;
export type Commitment = z.infer<typeof commitmentSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type DecisionCandidate = z.infer<typeof decisionCandidateSchema>;
export type DecisionFeedback = z.infer<typeof decisionFeedbackSchema>;
export type ActionProposal = z.infer<typeof actionProposalSchema>;
export type ActionAuthorization = z.infer<typeof actionAuthorizationSchema>;
export type ActionRun = z.infer<typeof actionRunSchema>;
export type ActionRunInput = z.infer<typeof actionRunInputSchema>;
export type ActionReceipt = z.infer<typeof actionReceiptSchema>;
export type ActionRunCheckpoint = z.infer<typeof actionRunCheckpointSchema>;
export type PolicyResult = z.infer<typeof policyResultSchema>;
export type DecisionRoute = z.infer<typeof decisionRouteSchema>;
export type AutonomyMode = z.infer<typeof autonomyModeSchema>;
export type TelegramChannelTarget = z.infer<typeof telegramChannelTargetSchema>;

const goalCreateSchema = goalSchema
  .omit({ id: true, profileId: true, createdAt: true, updatedAt: true })
  .partial({
    status: true,
    horizon: true,
    successCriteria: true,
    constraints: true,
    autonomyMode: true,
    planVersion: true,
    nextReviewAt: true,
  })
  .extend({
    title: z.string().trim().min(1).max(500),
    desiredOutcome: z.string().trim().min(1).max(4000),
  });
const commitmentCreateSchema = commitmentSchema.omit({
  id: true,
  profileId: true,
  createdAt: true,
  updatedAt: true,
});
const goalUpdateSchema = goalSchema
  .pick({
    title: true,
    desiredOutcome: true,
    status: true,
    horizon: true,
    successCriteria: true,
    constraints: true,
    autonomyMode: true,
    planVersion: true,
    nextReviewAt: true,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one goal field is required",
  });
const commitmentUpdateSchema = commitmentSchema
  .pick({ status: true, title: true, dueAt: true, evidenceIds: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one commitment field is required",
  });
const goalParamSchema = z.object({ goalId: idSchema });
const nextActionEvaluationCreateSchema = z.object({
  goalId: idSchema.optional(),
});
const decisionFeedbackCreateSchema = z.object({
  kind: decisionFeedbackKindSchema,
  candidateId: idSchema.optional(),
  note: z.string().trim().min(1).max(2000).optional(),
});
const actionProposalCreateSchema = z.object({
  candidateId: idSchema,
  expectedOutcome: z.string().trim().min(1).max(4000),
  input: z.record(z.string(), z.unknown()).default({}),
});
const actionAuthorizationCreateSchema = z.object({
  mode: actionAuthorizationModeSchema,
  constraints: z.record(z.string(), z.unknown()).default({}),
  expiresAt: isoDateTimeSchema.nullable().optional(),
});
const actionRunCreateSchema = z.object({
  authorizationId: idSchema,
  input: actionRunInputSchema,
});
const telegramChannelTargetSchema = z.object({
  alias: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
});
const telegramDraftCreateSchema = z
  .object({
    goalId: idSchema.optional(),
    targetAlias: z.string().trim().min(1).max(120).nullable().optional(),
    targetId: z.string().trim().min(1).max(300).nullable().optional(),
    text: z.string().trim().min(1).max(20_000),
    title: z.string().trim().min(1).max(1000).optional(),
    expectedOutcome: z.string().trim().min(1).max(4000),
  })
  .superRefine((value, ctx) => {
    if (value.targetAlias || value.targetId) {
      return;
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["targetAlias"],
      message: "A Telegram target alias or target ID is required",
    });
  });

export {
  actionAuthorizationCreateSchema,
  actionProposalCreateSchema,
  actionRunCreateSchema,
  commitmentCreateSchema,
  commitmentUpdateSchema,
  decisionFeedbackCreateSchema,
  goalCreateSchema,
  goalParamSchema,
  goalUpdateSchema,
  nextActionEvaluationCreateSchema,
  telegramChannelTargetSchema,
  telegramDraftCreateSchema,
};

const goalPromptContextSchema = z.object({
  activeGoals: z
    .array(
      z.object({
        id: idSchema,
        title: z.string().trim().min(1).max(500),
        desiredOutcome: z.string().trim().min(1).max(4000),
        horizon: goalHorizonSchema,
      })
    )
    .max(5),
  openCommitments: z
    .array(
      z.object({
        goalId: idSchema.nullable(),
        title: z.string().trim().min(1).max(1000),
        status: z.enum(["open", "blocked"]),
        dueAt: isoDateTimeSchema.nullable(),
      })
    )
    .max(12),
});

const nowOverviewSchema = z.object({
  activeGoals: z.array(goalSchema),
  openCommitments: z.array(commitmentSchema),
  recentDecisions: z.array(decisionSchema),
  nextReviewAt: isoDateTimeSchema.nullable(),
  suggestedAction: decisionCandidateSchema.nullable(),
  suggestedDecisionId: idSchema.nullable(),
});

export { goalPromptContextSchema, nowOverviewSchema };
export type GoalPromptContext = z.infer<typeof goalPromptContextSchema>;
export type NowOverview = z.infer<typeof nowOverviewSchema>;
export type GoalUpdate = z.infer<typeof goalUpdateSchema>;
export type CommitmentUpdate = z.infer<typeof commitmentUpdateSchema>;
