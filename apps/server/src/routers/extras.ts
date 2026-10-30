/**
 * Server-only procedures.
 *
 * These endpoints were skipped by `@neobuni/api` because they depend on modules
 * that only exist inside the Hono server (schedule planning, memory/digest
 * pipelines, messaging integrations, decision services). They are merged into
 * the API router as `{ ...appRouter, ...extrasRouter }`, so every namespace that
 * already has procedures in `@neobuni/api` is spread first to keep those
 * procedures reachable.
 */

import { createHash } from "node:crypto";
import { protectedProcedure, run } from "@neobuni/api";
import { configRouter } from "@neobuni/api/routers/config";
import { goalsRouter } from "@neobuni/api/routers/goals";
import { knowledgeRouter } from "@neobuni/api/routers/knowledge";
import { memoriesRouter } from "@neobuni/api/routers/memories";
import { schedulesRouter } from "@neobuni/api/routers/schedules";
import {
  actionRunCreateSchema,
  discordMessagingConfigInputSchema,
  feishuConfigInputSchema,
  knowledgeDocumentCreateSchema,
  memoryDigestSchema,
  memorySearchSchema,
  nextActionEvaluationCreateSchema,
  providerModelListInputSchema,
  qqConfigInputSchema,
  scheduleCreateSchema,
  scheduleUpdateSchema,
  telegramChannelTargetSchema,
  telegramDraftCreateSchema,
  telegramMessagingConfigInputSchema,
} from "@neobuni/contracts";
import {
  buildNextActionCandidates,
  isActionAuthorizedForExecution,
  isProposalInputBoundToCandidate,
  selectHeuristicNextAction,
} from "@neobuni/core";
import {
  appendEvent,
  clearMemoryEmbeddings,
  createActionProposal,
  createActionRun,
  createSchedule,
  getActionAuthorization,
  getActionProposal,
  getActionRunByProposal,
  getConversation,
  getDecisionTrace,
  getGoal,
  getMemoryEmbeddingProviderConfig,
  getMemoryReasoningProviderConfig,
  getProviderConfig,
  getSchedule,
  listCommitments,
  listDecisionTracesByGoal,
  listGoals,
  listMemories,
  recordDecisionTrace,
  updateSchedule,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { recordNextActionEvaluation } from "../decision/next-action-evaluation-service";
import { runManualDigest } from "../digest/digest-pipeline";
import { toOpenAICompatibleConfig } from "../digest/memory-provider-config";
import {
  getEffectiveDiscordConfig,
  saveDiscordConfig,
} from "../integrations/discord";
import {
  getEffectiveFeishuConfig,
  saveFeishuConfig,
} from "../integrations/feishu";
import { getEffectiveQqConfig, saveQqConfig } from "../integrations/qq";
import {
  getEffectiveTelegramConfig,
  saveTelegramConfig,
} from "../integrations/telegram";
import { ingestKnowledgeDocument } from "../memory/knowledge-ingest-service";
import { syncMemoryEmbedding } from "../memory/memory-write-side-effects";
import { recallMemories } from "../memory/temporal-memory-store";
import { listOpenCodeModels } from "../providers/opencode";
import { runRuntimeProviderSelfChecks } from "../runtime/provider-self-check";
import {
  planScheduleCreateInput,
  planScheduleUpdateInput,
  SchedulePlanError,
} from "../schedules/plan-schedule";

const planOrThrow = <T>(plan: () => T): T => {
  try {
    return plan();
  } catch (error) {
    if (error instanceof SchedulePlanError) {
      throw new ORPCError("BAD_REQUEST", {
        message: error.message,
        cause: error,
      });
    }

    throw error;
  }
};

const getEmbeddingConfig = async (profileId: string) =>
  toOpenAICompatibleConfig(
    await run(getMemoryEmbeddingProviderConfig(profileId))
  );

const getReasoningConfig = async (profileId: string) =>
  toOpenAICompatibleConfig(
    await run(getMemoryReasoningProviderConfig(profileId))
  );

const buildTelegramStateFingerprint = (input: {
  targetAlias: string | null;
  targetId: string | null;
  text: string;
}) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        operation: "telegram_message_send",
        targetAlias: input.targetAlias,
        targetId: input.targetId,
        text: input.text,
      })
    )
    .digest("hex")
    .slice(0, 32);

export const extrasRouter = {
  schedules: {
    ...schedulesRouter,

    create: protectedProcedure
      .route({
        method: "POST",
        path: "/schedules",
        summary: "Create a schedule",
        description:
          "Validate and create a one-off or cron schedule, then record a creation event.",
        tags: ["Schedules"],
      })
      .input(scheduleCreateSchema)
      .handler(async ({ input, context }) => {
        const planned = planOrThrow(() =>
          planScheduleCreateInput({
            schedule: input,
            referenceNow: new Date().toISOString(),
          })
        );

        const schedule = await run(createSchedule(context.profileId, planned));

        await run(
          appendEvent(context.profileId, "schedule.created", {
            scheduleId: schedule.id,
            type: schedule.type,
          })
        );

        return schedule;
      }),

    update: protectedProcedure
      .route({
        method: "PATCH",
        path: "/schedules/{scheduleId}",
        summary: "Update a schedule",
        description:
          "Re-plan and patch a schedule's trigger, content, or status, then record an update event.",
        tags: ["Schedules"],
      })
      .input(scheduleUpdateSchema.extend({ scheduleId: z.string().min(1) }))
      .handler(async ({ input, context }) => {
        const { scheduleId, ...update } = input;
        const existing = await run(getSchedule(scheduleId));

        if (!existing || existing.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", { message: "Schedule not found" });
        }

        const planned = planOrThrow(() =>
          planScheduleUpdateInput({
            current: existing,
            update,
            referenceNow: new Date().toISOString(),
          })
        );

        const schedule = await run(updateSchedule(scheduleId, planned));

        if (!schedule) {
          throw new ORPCError("NOT_FOUND", { message: "Schedule not found" });
        }

        await run(
          appendEvent(context.profileId, "schedule.updated", { scheduleId })
        );

        return schedule;
      }),
  },

  knowledge: {
    ...knowledgeRouter,

    create: protectedProcedure
      .route({
        method: "POST",
        path: "/knowledge",
        summary: "Ingest a knowledge document",
        description:
          "Chunk, embed, and extract facts from a profile-scoped knowledge document, then record an ingest event.",
        tags: ["Knowledge"],
      })
      .input(knowledgeDocumentCreateSchema)
      .handler(async ({ input, context }) => {
        if (input.scope === "global") {
          throw new ORPCError("FORBIDDEN", {
            message:
              "Global knowledge ingest is not enabled for profile routes",
          });
        }

        const [memoryEmbeddingConfig, memoryReasoningConfig] =
          await Promise.all([
            run(getMemoryEmbeddingProviderConfig(context.profileId)),
            run(getMemoryReasoningProviderConfig(context.profileId)),
          ]);

        const data = await ingestKnowledgeDocument({
          profileId: context.profileId,
          title: input.title,
          content: input.content,
          sourceType: input.sourceType,
          sourceUri: input.sourceUri ?? null,
          scope: input.scope,
          trustLevel: input.trustLevel,
          embeddingConfig: toOpenAICompatibleConfig(memoryEmbeddingConfig),
          reasoningConfig: toOpenAICompatibleConfig(memoryReasoningConfig),
        });

        await run(
          appendEvent(context.profileId, "knowledge.ingested", {
            documentId: data.documentId,
            created: data.created,
            chunkCount: data.chunkCount,
            factCount: data.factCount,
            scope: input.scope,
            sourceType: input.sourceType,
          })
        );

        return data;
      }),
  },

  memories: {
    ...memoriesRouter,

    search: protectedProcedure
      .route({
        method: "POST",
        path: "/memories/search",
        summary: "Search memories",
        description:
          "Run a hybrid keyword and embedding recall over stored memories. Requires a configured memory embedding provider.",
        tags: ["Memories"],
      })
      .input(memorySearchSchema)
      .handler(async ({ input, context }) => {
        const embeddingConfig = await getEmbeddingConfig(context.profileId);

        if (!embeddingConfig) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Memory embedding provider not configured",
          });
        }

        return recallMemories({
          profileId: context.profileId,
          query: input.query,
          queryKeywords: input.keywords,
          embeddingConfig,
          limit: input.limit,
        });
      }),

    digest: protectedProcedure
      .route({
        method: "POST",
        path: "/memories/digest",
        summary: "Digest a conversation into memories",
        description:
          "Run the memory digest pipeline over one conversation and persist the extracted memories.",
        tags: ["Memories"],
      })
      .input(memoryDigestSchema)
      .handler(async ({ input, context }) => {
        const conversation = await run(getConversation(input.conversationId));

        if (!conversation || conversation.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", {
            message: "Conversation not found",
          });
        }

        const [embeddingConfig, reasoningConfig] = await Promise.all([
          getEmbeddingConfig(context.profileId),
          getReasoningConfig(context.profileId),
        ]);

        if (!(embeddingConfig && reasoningConfig)) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              "Memory embedding and reasoning providers must be configured",
          });
        }

        const data = await runManualDigest(
          context.profileId,
          input.conversationId,
          reasoningConfig,
          embeddingConfig
        );

        await run(
          appendEvent(context.profileId, "memory.digest", {
            conversationId: input.conversationId,
            memoriesCreated: data.memoriesCreated,
            messagesProcessed: data.messagesProcessed,
          })
        );

        return data;
      }),

    reindex: protectedProcedure
      .route({
        method: "POST",
        path: "/memories/reindex",
        summary: "Reindex memory embeddings",
        description:
          "Clear and rebuild every memory embedding for the current profile, reporting reindexed and failed counts.",
        tags: ["Memories"],
      })
      .handler(async ({ context }) => {
        const embeddingConfig = await getEmbeddingConfig(context.profileId);

        if (!embeddingConfig) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Memory embedding provider not configured",
          });
        }

        const memories = await run(listMemories(context.profileId));
        await run(clearMemoryEmbeddings);

        let reindexed = 0;
        let failed = 0;

        // Reindex sequentially: the embedding provider is rate limited.
        for (const memory of memories) {
          try {
            await syncMemoryEmbedding({
              embeddingConfig,
              memoryId: memory.id,
              content: memory.content,
              status: memory.status,
            });

            if (memory.status === "active") {
              reindexed += 1;
            }
          } catch (error) {
            failed += 1;
            console.warn(`Failed to reindex memory ${memory.id}:`, error);
          }
        }

        const data = { total: memories.length, reindexed, failed };
        await run(appendEvent(context.profileId, "memory.reindex", data));

        return data;
      }),
  },

  config: {
    ...configRouter,

    providerChecks: protectedProcedure
      .route({
        method: "GET",
        path: "/config/provider-checks",
        summary: "Run provider self-checks",
        description:
          "Probe the configured chat, memory embedding, and memory reasoning providers and report a pass, fail, or skip status per slot.",
        tags: ["Config"],
      })
      .handler(async ({ context }) => {
        const [chatConfig, memoryEmbeddingConfig, memoryReasoningConfig] =
          await Promise.all([
            run(getProviderConfig(context.profileId)),
            run(getMemoryEmbeddingProviderConfig(context.profileId)),
            run(getMemoryReasoningProviderConfig(context.profileId)),
          ]);

        return runRuntimeProviderSelfChecks({
          chatConfig,
          memoryEmbeddingConfig,
          memoryReasoningConfig,
        });
      }),

    /**
     * Fills the model picker from the vendor's own catalogue. Only OpenCode
     * exposes one today; other vendors return an empty list.
     */
    providerModels: protectedProcedure
      .route({
        method: "GET",
        path: "/config/provider/models",
        summary: "List provider models",
        description:
          "Return the model catalogue of a vendor for the provider picker. Only OpenCode publishes one; other vendors return an empty list.",
        tags: ["Config"],
      })
      .input(providerModelListInputSchema)
      .handler(async ({ input }) => ({
        models:
          input.provider === "opencode"
            ? await listOpenCodeModels({ baseUrl: input.baseUrl })
            : [],
      })),

    messaging: {
      discord: {
        get: protectedProcedure
          .route({
            method: "GET",
            path: "/config/messaging/discord",
            summary: "Get the Discord messaging config",
            description:
              "Return the effective Discord bot configuration, falling back to environment defaults when the database has none.",
            tags: ["Config"],
          })
          .handler(({ context }) =>
            getEffectiveDiscordConfig(context.profileId)
          ),

        put: protectedProcedure
          .route({
            method: "PUT",
            path: "/config/messaging/discord",
            summary: "Replace the Discord messaging config",
            description:
              "Upsert the Discord bot credentials, signature keys, and channel targets for the current profile.",
            tags: ["Config"],
          })
          .input(discordMessagingConfigInputSchema)
          .handler(({ input, context }) =>
            saveDiscordConfig(context.profileId, input)
          ),
      },

      telegram: {
        get: protectedProcedure
          .route({
            method: "GET",
            path: "/config/messaging/telegram",
            summary: "Get the Telegram messaging config",
            description:
              "Return the effective Telegram bot configuration, falling back to environment defaults when the database has none.",
            tags: ["Config"],
          })
          .handler(({ context }) =>
            getEffectiveTelegramConfig(context.profileId)
          ),

        put: protectedProcedure
          .route({
            method: "PUT",
            path: "/config/messaging/telegram",
            summary: "Replace the Telegram messaging config",
            description:
              "Upsert the Telegram bot credentials, webhook secret, and channel targets for the current profile.",
            tags: ["Config"],
          })
          .input(telegramMessagingConfigInputSchema)
          .handler(({ input, context }) =>
            saveTelegramConfig(context.profileId, input)
          ),
      },

      feishu: {
        get: protectedProcedure
          .route({
            method: "GET",
            path: "/config/messaging/feishu",
            summary: "Get the Feishu messaging config",
            description:
              "Return the effective Feishu app configuration, falling back to environment defaults when the database has none.",
            tags: ["Config"],
          })
          .handler(({ context }) =>
            getEffectiveFeishuConfig(context.profileId)
          ),

        put: protectedProcedure
          .route({
            method: "PUT",
            path: "/config/messaging/feishu",
            summary: "Replace the Feishu messaging config",
            description:
              "Upsert the Feishu app id, secret, base URL, and delivery targets for the current profile.",
            tags: ["Config"],
          })
          .input(feishuConfigInputSchema)
          .handler(({ input, context }) =>
            saveFeishuConfig(context.profileId, input)
          ),
      },

      qq: {
        get: protectedProcedure
          .route({
            method: "GET",
            path: "/config/messaging/qq",
            summary: "Get the QQ messaging config",
            description:
              "Return the effective QQ bot configuration, falling back to environment defaults when the database has none.",
            tags: ["Config"],
          })
          .handler(({ context }) => getEffectiveQqConfig(context.profileId)),

        put: protectedProcedure
          .route({
            method: "PUT",
            path: "/config/messaging/qq",
            summary: "Replace the QQ messaging config",
            description:
              "Upsert the QQ bot credentials, base URL, and delivery targets for the current profile.",
            tags: ["Config"],
          })
          .input(qqConfigInputSchema)
          .handler(({ input, context }) =>
            saveQqConfig(context.profileId, input)
          ),
      },
    },
  },

  goals: {
    ...goalsRouter,

    now: protectedProcedure
      .route({
        method: "GET",
        path: "/now",
        summary: "Get the Now snapshot",
        description:
          "Return active goals, open commitments, recent decisions, the next review date, and the suggested next action for the Now view.",
        tags: ["Now"],
      })
      .handler(async ({ context }) => {
        const [activeGoals, commitments] = await Promise.all([
          run(listGoals(context.profileId, "active")),
          run(listCommitments(context.profileId)),
        ]);
        const openCommitments = commitments.filter(
          (commitment) =>
            commitment.status === "open" || commitment.status === "blocked"
        );
        const decisionGroups = await Promise.all(
          activeGoals.map((goal) =>
            run(listDecisionTracesByGoal(context.profileId, goal.id))
          )
        );
        const recentDecisions = decisionGroups
          .flat()
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 20);
        const nextReviewAt =
          activeGoals
            .map((goal) => goal.nextReviewAt)
            .filter((value): value is string => value !== null)
            .sort()[0] ?? null;
        const candidates = buildNextActionCandidates({
          goals: activeGoals,
          commitments: openCommitments,
        });
        const latestSuggestionTrace =
          (
            await Promise.all(
              recentDecisions
                .filter(
                  (decision) =>
                    decision.kind === "next_action" &&
                    decision.route === "suggest"
                )
                .slice(0, 1)
                .map((decision) => run(getDecisionTrace(decision.id)))
            )
          ).find(
            (trace): trace is NonNullable<typeof trace> => trace !== null
          ) ?? null;
        const suggestedAction =
          (latestSuggestionTrace
            ? selectHeuristicNextAction(latestSuggestionTrace.candidates)
            : null) ?? selectHeuristicNextAction(candidates);

        return {
          activeGoals,
          openCommitments,
          recentDecisions,
          nextReviewAt,
          suggestedAction,
          suggestedDecisionId: latestSuggestionTrace?.decision.id ?? null,
        };
      }),

    nextActionEvaluations: protectedProcedure
      .route({
        method: "POST",
        path: "/goals/next-action-evaluations",
        summary: "Evaluate the next action",
        description:
          "Recompute next-action candidates across active goals, optionally scoped to one goal, and record the resulting decision.",
        tags: ["Goals"],
      })
      .input(nextActionEvaluationCreateSchema)
      .handler(async ({ input, context }) => {
        const [activeGoals, commitments] = await Promise.all([
          run(listGoals(context.profileId, "active")),
          run(listCommitments(context.profileId)),
        ]);

        if (
          input.goalId &&
          !activeGoals.some((goal) => goal.id === input.goalId)
        ) {
          throw new ORPCError("NOT_FOUND", {
            message: "Active goal not found",
          });
        }

        const data = await run(
          recordNextActionEvaluation({
            profileId: context.profileId,
            goals: activeGoals,
            commitments,
            goalId: input.goalId,
            trigger: "explicit_now_evaluation",
          })
        );

        await run(
          appendEvent(context.profileId, "goal.next_action_evaluated", {
            decisionId: data.decision.id,
            goalId: input.goalId ?? null,
          })
        );

        return data;
      }),

    telegramTargets: protectedProcedure
      .route({
        method: "GET",
        path: "/telegram/targets",
        summary: "List Telegram delivery targets",
        description:
          "Return the enabled Telegram channel targets, as aliases and labels, available for drafts.",
        tags: ["Telegram"],
      })
      .handler(async ({ context }) => {
        const config = await getEffectiveTelegramConfig(context.profileId);

        return config.enabled
          ? config.targets
              .filter(
                (target) => target.enabled && target.targetType === "channel"
              )
              .map((target) =>
                telegramChannelTargetSchema.parse({
                  alias: target.alias,
                  label: target.label.trim() || target.alias,
                })
              )
          : [];
      }),

    telegramDrafts: protectedProcedure
      .route({
        method: "POST",
        path: "/telegram/drafts",
        summary: "Create a Telegram message draft",
        description:
          "Create a confirmation-gated Telegram message draft for a channel alias, optionally bound to a goal, and return the decision plus proposal.",
        tags: ["Telegram"],
      })
      .input(telegramDraftCreateSchema)
      .handler(async ({ input, context }) => {
        const { profileId } = context;

        if (input.goalId) {
          const goal = await run(getGoal(input.goalId));

          if (!goal || goal.profileId !== profileId) {
            throw new ORPCError("NOT_FOUND", { message: "Goal not found" });
          }
        }

        const targetAlias = input.targetAlias ?? null;
        const targetId = input.targetId ?? null;
        const telegramConfig = await getEffectiveTelegramConfig(profileId);
        const target = targetAlias
          ? telegramConfig.targets.find(
              (item) =>
                item.alias === targetAlias &&
                item.enabled &&
                item.targetType === "channel"
            )
          : null;

        if (
          !(telegramConfig.enabled && target && targetAlias) ||
          targetId !== null
        ) {
          throw new ORPCError("UNPROCESSABLE_CONTENT", {
            message:
              "A configured enabled Telegram channel target alias is required",
          });
        }

        const candidateId = `telegram:${targetAlias}`;
        const title = input.title ?? "发送 Telegram 草稿";
        const stateFingerprint = buildTelegramStateFingerprint({
          targetAlias,
          targetId,
          text: input.text,
        });

        const decision = await run(
          recordDecisionTrace({
            decision: {
              profileId,
              goalId: input.goalId ?? null,
              kind: "planning_escalation",
              trigger: "user_created_telegram_draft",
              stateFingerprint,
              route: "request_confirmation",
              policyResult: {
                permitted: true,
                route: "request_confirmation",
                reasons: ["telegram_every_send_requires_confirmation"],
                policyVersion: "telegram-confirmation-v1",
              },
            },
            candidates: [
              {
                id: candidateId,
                kind: "telegram_message",
                title,
                rationale: "用户创建的外部消息草稿，发送前需要明确确认。",
                reversibility: "irreversible",
                authority: "confirmation",
                eligible: true,
              },
            ],
          })
        );

        const proposal = await run(
          createActionProposal({
            profileId,
            goalId: input.goalId ?? null,
            decisionId: decision.id,
            candidateId,
            kind: "telegram_message",
            title,
            expectedOutcome: input.expectedOutcome,
            reversibility: "irreversible",
            requiredAuthority: "confirmation",
            input: {
              operation: "telegram_message_send",
              targetAlias,
              targetId,
              text: input.text,
            },
            status: "proposed",
          })
        );

        await run(
          appendEvent(profileId, "telegram_draft.created", {
            decisionId: decision.id,
            proposalId: proposal.id,
            goalId: input.goalId ?? null,
            targetAlias,
            targetId,
          })
        );

        return { decision, proposal };
      }),

    actionProposals: {
      ...goalsRouter.actionProposals,

      createRun: protectedProcedure
        .route({
          method: "POST",
          path: "/action-proposals/{proposalId}/runs",
          summary: "Queue an action run",
          description:
            "Queue an action run for an authorized proposal, rejecting unauthorized or unbound input.",
          tags: ["Action Runs"],
        })
        .input(actionRunCreateSchema.extend({ proposalId: z.string().min(1) }))
        .handler(async ({ input, context }) => {
          const { proposalId, ...payload } = input;

          const [proposal, authorization, existing] = await Promise.all([
            run(getActionProposal(proposalId)),
            run(getActionAuthorization(payload.authorizationId)),
            run(getActionRunByProposal(proposalId)),
          ]);

          if (!proposal || proposal.profileId !== context.profileId) {
            throw new ORPCError("NOT_FOUND", { message: "Proposal not found" });
          }

          if (existing) {
            throw new ORPCError("CONFLICT", {
              message: "An action run already exists for this proposal",
              data: existing,
            });
          }

          if (
            !(
              authorization &&
              isActionAuthorizedForExecution({
                authorization,
                proposal,
                action: payload.input,
                nowIso: new Date().toISOString(),
              })
            )
          ) {
            throw new ORPCError("UNPROCESSABLE_CONTENT", {
              message: "An active execution authorization is required",
            });
          }

          if (
            !isProposalInputBoundToCandidate({
              proposal,
              action: payload.input,
            })
          ) {
            throw new ORPCError("UNPROCESSABLE_CONTENT", {
              message: "Action input must be bound to the original candidate",
            });
          }

          const actionRun = await run(
            createActionRun({
              profileId: context.profileId,
              proposalId,
              authorizationId: authorization.id,
              input: payload.input,
            })
          );

          await run(
            appendEvent(context.profileId, "action_run.queued", {
              actionRunId: actionRun.id,
              proposalId,
              authorizationId: authorization.id,
            })
          );

          return actionRun;
        }),
    },
  },
};
