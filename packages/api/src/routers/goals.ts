import {
  actionAuthorizationCreateSchema,
  actionProposalCreateSchema,
  commitmentUpdateSchema,
  decisionFeedbackCreateSchema,
  goalCreateSchema,
  goalParamSchema,
  goalUpdateSchema,
} from "@neobuni/contracts";
import {
  appendEvent,
  cancelActionRun,
  confirmActionRunReceipt,
  createActionAuthorization,
  createActionProposal,
  createCommitment,
  createGoal,
  getActionProposal,
  getActionRun,
  getDecisionTrace,
  getGoal,
  listCommitments,
  listDecisionTracesByGoal,
  listGoals,
  recordDecisionFeedback,
  updateActionProposalStatus,
  updateCommitment,
  updateGoal,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { run } from "../run";

// Procedures that need modules from `apps/server` (schedule planning, memory
// pipelines, integrations, decision services) live in
// `apps/server/src/routers/extras.ts` and are merged over this router. This file
// intentionally depends only on `@neobuni/db` and `@neobuni/contracts`.

const commitmentParamSchema = goalParamSchema.extend({
  commitmentId: z.string().min(1),
});
const decisionParamSchema = goalParamSchema.extend({
  decisionId: z.string().min(1),
});
const decisionIdSchema = z.object({ decisionId: z.string().min(1) });
const proposalIdSchema = z.object({ proposalId: z.string().min(1) });
const actionRunIdSchema = z.object({ actionRunId: z.string().min(1) });

const commitmentCreateSchema = z.object({
  kind: z.enum(["task", "promise", "deadline", "decision", "dependency"]),
  status: z.enum(["open", "blocked", "done", "cancelled"]),
  owner: z.enum(["user", "buni", "external"]),
  title: z.string().trim().min(1).max(1000),
  dueAt: z.string().datetime().nullable(),
  evidenceIds: z.array(z.string().min(1)).max(64),
});

const requireGoal = async (profileId: string, goalId: string) => {
  const goal = await run(getGoal(goalId));

  if (!goal || goal.profileId !== profileId) {
    throw new ORPCError("NOT_FOUND", { message: "Goal not found" });
  }

  return goal;
};

export const goalsRouter = {
  list: protectedProcedure
    .route({
      method: "GET",
      path: "/goals",
      summary: "List goals",
      description:
        "Return every goal owned by the current profile with its status, horizon, and review date.",
      tags: ["Goals"],
    })
    .handler(({ context }) => run(listGoals(context.profileId))),

  create: protectedProcedure
    .route({
      method: "POST",
      path: "/goals",
      summary: "Create a goal",
      description:
        "Create a goal with success criteria, constraints, horizon, and autonomy mode, then record a creation event.",
      tags: ["Goals"],
    })
    .input(goalCreateSchema)
    .handler(async ({ input, context }) => {
      const goal = await run(
        createGoal({
          profileId: context.profileId,
          title: input.title,
          desiredOutcome: input.desiredOutcome,
          status: input.status ?? "draft",
          horizon: input.horizon ?? "project",
          successCriteria: input.successCriteria ?? [],
          constraints: input.constraints ?? [],
          autonomyMode: input.autonomyMode ?? "collaborate",
          planVersion: input.planVersion ?? 0,
          nextReviewAt: input.nextReviewAt ?? null,
        })
      );

      await run(
        appendEvent(context.profileId, "goal.created", { goalId: goal.id })
      );

      return goal;
    }),

  get: protectedProcedure
    .route({
      method: "GET",
      path: "/goals/{goalId}",
      summary: "Get a goal",
      description: "Return one goal with its commitments and decision traces.",
      tags: ["Goals"],
    })
    .input(goalParamSchema)
    .handler(async ({ input, context }) => {
      const goal = await requireGoal(context.profileId, input.goalId);
      const [commitments, decisions] = await Promise.all([
        run(listCommitments(context.profileId, goal.id)),
        run(listDecisionTracesByGoal(context.profileId, goal.id)),
      ]);

      return { goal, commitments, decisions };
    }),

  update: protectedProcedure
    .route({
      method: "PATCH",
      path: "/goals/{goalId}",
      summary: "Update a goal",
      description:
        "Patch goal fields such as status, horizon, success criteria, or next review date, then record the changed fields.",
      tags: ["Goals"],
    })
    .input(goalParamSchema.and(goalUpdateSchema))
    .handler(async ({ input, context }) => {
      const { goalId, ...patch } = input;
      const goal = await run(
        updateGoal({ profileId: context.profileId, goalId, patch })
      );

      if (!goal) {
        throw new ORPCError("NOT_FOUND", { message: "Goal not found" });
      }

      await run(
        appendEvent(context.profileId, "goal.updated", {
          goalId,
          changedFields: Object.keys(patch),
        })
      );

      return goal;
    }),

  commitments: {
    create: protectedProcedure
      .route({
        method: "POST",
        path: "/goals/{goalId}/commitments",
        summary: "Create a commitment",
        description:
          "Attach a task, promise, deadline, decision, or dependency commitment to a goal.",
        tags: ["Goals"],
      })
      .input(goalParamSchema.and(commitmentCreateSchema))
      .handler(async ({ input, context }) => {
        const { goalId, ...payload } = input;
        await requireGoal(context.profileId, goalId);

        const commitment = await run(
          createCommitment({
            ...payload,
            profileId: context.profileId,
            goalId,
          })
        );

        await run(
          appendEvent(context.profileId, "goal.commitment_created", {
            goalId,
            commitmentId: commitment.id,
          })
        );

        return commitment;
      }),

    update: protectedProcedure
      .route({
        method: "PATCH",
        path: "/goals/{goalId}/commitments/{commitmentId}",
        summary: "Update a commitment",
        description:
          "Patch a commitment's title, status, owner, due date, or evidence references.",
        tags: ["Goals"],
      })
      .input(commitmentParamSchema.and(commitmentUpdateSchema))
      .handler(async ({ input, context }) => {
        const { goalId, commitmentId, ...patch } = input;
        await requireGoal(context.profileId, goalId);

        const commitment = await run(
          updateCommitment({
            profileId: context.profileId,
            goalId,
            commitmentId,
            patch,
          })
        );

        if (!commitment) {
          throw new ORPCError("NOT_FOUND", {
            message: "Commitment not found",
          });
        }

        await run(
          appendEvent(context.profileId, "goal.commitment_updated", {
            goalId,
            commitmentId,
            changedFields: Object.keys(patch),
          })
        );

        return commitment;
      }),
  },

  decisions: {
    get: protectedProcedure
      .route({
        method: "GET",
        path: "/goals/{goalId}/decisions/{decisionId}",
        summary: "Get a decision trace",
        description:
          "Return one decision trace inside a goal, including its candidates and policy result.",
        tags: ["Decisions"],
      })
      .input(decisionParamSchema)
      .handler(async ({ input, context }) => {
        const trace = await run(getDecisionTrace(input.decisionId));

        if (
          !trace ||
          trace.decision.profileId !== context.profileId ||
          trace.decision.goalId !== input.goalId
        ) {
          throw new ORPCError("NOT_FOUND", { message: "Decision not found" });
        }

        return trace;
      }),

    feedback: protectedProcedure
      .route({
        method: "POST",
        path: "/decisions/{decisionId}/feedback",
        summary: "Record decision feedback",
        description:
          "Record user feedback on a decision, optionally pinned to one of its candidates.",
        tags: ["Decisions"],
      })
      .input(decisionIdSchema.and(decisionFeedbackCreateSchema))
      .handler(async ({ input, context }) => {
        const trace = await run(getDecisionTrace(input.decisionId));

        if (!trace || trace.decision.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", { message: "Decision not found" });
        }

        if (
          input.candidateId &&
          !trace.candidates.some(
            (candidate) => candidate.id === input.candidateId
          )
        ) {
          throw new ORPCError("UNPROCESSABLE_CONTENT", {
            message: "Candidate not found",
          });
        }

        const feedback = await run(
          recordDecisionFeedback({
            decisionId: input.decisionId,
            profileId: context.profileId,
            kind: input.kind,
            candidateId: input.candidateId ?? null,
            note: input.note ?? null,
          })
        );

        await run(
          appendEvent(context.profileId, "goal.decision_feedback_recorded", {
            decisionId: input.decisionId,
            feedbackId: feedback.id,
            kind: feedback.kind,
          })
        );

        return feedback;
      }),
  },

  actionProposals: {
    get: protectedProcedure
      .route({
        method: "GET",
        path: "/action-proposals/{proposalId}",
        summary: "Get an action proposal",
        description:
          "Return one action proposal with its kind, reversibility, required authority, and proposed input.",
        tags: ["Action Proposals"],
      })
      .input(proposalIdSchema)
      .handler(async ({ input, context }) => {
        const proposal = await run(getActionProposal(input.proposalId));

        if (!proposal || proposal.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", { message: "Proposal not found" });
        }

        return proposal;
      }),

    create: protectedProcedure
      .route({
        method: "POST",
        path: "/action-proposals",
        summary: "Create an action proposal",
        description:
          "Create a proposal for an eligible decision candidate and record a creation event. The decision is passed in the body.",
        tags: ["Action Proposals"],
      })
      .input(decisionIdSchema.and(actionProposalCreateSchema))
      .handler(async ({ input, context }) => {
        const trace = await run(getDecisionTrace(input.decisionId));

        if (!trace || trace.decision.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", { message: "Decision not found" });
        }

        const candidate = trace.candidates.find(
          (item) => item.id === input.candidateId
        );

        if (!candidate?.eligible) {
          throw new ORPCError("UNPROCESSABLE_CONTENT", {
            message: "Eligible candidate not found",
          });
        }

        const proposal = await run(
          createActionProposal({
            profileId: context.profileId,
            goalId: trace.decision.goalId,
            decisionId: input.decisionId,
            candidateId: candidate.id,
            kind: candidate.kind,
            title: candidate.title,
            expectedOutcome: input.expectedOutcome,
            reversibility: candidate.reversibility,
            requiredAuthority: candidate.authority,
            input: input.input,
            status: "proposed",
          })
        );

        await run(
          appendEvent(context.profileId, "goal.action_proposal_created", {
            decisionId: input.decisionId,
            proposalId: proposal.id,
          })
        );

        return proposal;
      }),

    authorize: protectedProcedure
      .route({
        method: "POST",
        path: "/action-proposals/{proposalId}/authorize",
        summary: "Authorize an action proposal",
        description:
          "Grant execution or notify-mode authorization for a proposal. Denials are expressed by not granting anything.",
        tags: ["Action Proposals"],
      })
      .input(proposalIdSchema.and(actionAuthorizationCreateSchema))
      .handler(async ({ input, context }) => {
        const proposal = await run(getActionProposal(input.proposalId));

        if (!proposal || proposal.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", { message: "Proposal not found" });
        }

        if (input.mode === "deny") {
          throw new ORPCError("UNPROCESSABLE_CONTENT", {
            message: "Denial is represented by not granting authorization",
          });
        }

        if (
          input.mode === "execute" &&
          proposal.reversibility !== "reversible" &&
          proposal.kind !== "telegram_message"
        ) {
          throw new ORPCError("UNPROCESSABLE_CONTENT", {
            message:
              "Only reversible proposals may receive execution authorization",
          });
        }

        const authorization = await run(
          createActionAuthorization({
            proposalId: input.proposalId,
            profileId: context.profileId,
            mode: input.mode,
            grantedBy: "user",
            constraints: input.constraints,
            expiresAt: input.expiresAt ?? null,
          })
        );

        if (authorization.mode === "execute") {
          await run(updateActionProposalStatus(input.proposalId, "authorized"));
        }

        await run(
          appendEvent(context.profileId, "goal.action_authorization_recorded", {
            proposalId: input.proposalId,
            authorizationId: authorization.id,
            mode: authorization.mode,
          })
        );

        return authorization;
      }),
  },

  actionRuns: {
    get: protectedProcedure
      .route({
        method: "GET",
        path: "/action-runs/{actionRunId}",
        summary: "Get an action run",
        description:
          "Return one action run with its status, authorization, and receipt.",
        tags: ["Action Runs"],
      })
      .input(actionRunIdSchema)
      .handler(async ({ input, context }) => {
        const actionRun = await run(getActionRun(input.actionRunId));

        if (!actionRun || actionRun.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", { message: "Action run not found" });
        }

        return actionRun;
      }),

    cancel: protectedProcedure
      .route({
        method: "POST",
        path: "/action-runs/{actionRunId}/cancel",
        summary: "Cancel an action run",
        description:
          "Cancel an action run that has not reached a terminal status and record a cancellation event.",
        tags: ["Action Runs"],
      })
      .input(actionRunIdSchema)
      .handler(async ({ input, context }) => {
        const current = await run(getActionRun(input.actionRunId));

        if (!current || current.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", { message: "Action run not found" });
        }

        const actionRun = await run(cancelActionRun(current.id));

        if (!actionRun) {
          throw new ORPCError("CONFLICT", {
            message: "Action run can no longer be cancelled",
          });
        }

        await run(
          appendEvent(context.profileId, "action_run.cancelled", {
            actionRunId: actionRun.id,
            proposalId: actionRun.proposalId,
          })
        );

        return actionRun;
      }),

    confirmReceipt: protectedProcedure
      .route({
        method: "POST",
        path: "/action-runs/{actionRunId}/confirm-receipt",
        summary: "Confirm an action run receipt",
        description:
          "Confirm the external receipt of an action run, then record the receipt kind in the event log.",
        tags: ["Action Runs"],
      })
      .input(actionRunIdSchema)
      .handler(async ({ input, context }) => {
        const current = await run(getActionRun(input.actionRunId));

        if (!current || current.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", { message: "Action run not found" });
        }

        const actionRun = await run(confirmActionRunReceipt(current.id));

        if (!actionRun) {
          throw new ORPCError("CONFLICT", {
            message: "Action run has no externally confirmable receipt",
          });
        }

        await run(
          appendEvent(context.profileId, "action_run.receipt_confirmed", {
            actionRunId: actionRun.id,
            proposalId: actionRun.proposalId,
            receiptKind: actionRun.receipt?.kind ?? null,
          })
        );

        return actionRun;
      }),
  },
};
