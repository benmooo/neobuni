import { runRepo } from "@neobuni/db";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";
import { executeClaimedActionRun } from "./worker";

const nowIso = "2026-10-21T00:00:00.000Z";
const actionRun = {
  id: "run-1",
  profileId: "profile-1",
  proposalId: "proposal-1",
  authorizationId: "authorization-1",
  idempotencyKey: "action-run:run-1",
  status: "queued" as const,
  input: {
    operation: "commitment_status_update" as const,
    commitmentId: "commitment-1",
    expectedStatus: "open" as const,
    nextStatus: "done" as const,
  },
  attempt: 0,
  maxAttempts: 1,
  leaseOwner: null,
  leaseExpiresAt: null,
  checkpoint: null,
  receipt: null,
  result: null,
  error: null,
  createdAt: nowIso,
  startedAt: null,
  finishedAt: null,
  updatedAt: nowIso,
};
const proposal = {
  id: "proposal-1",
  profileId: "profile-1",
  goalId: "goal-1",
  decisionId: "decision-1",
  candidateId: "commitment:commitment-1",
  kind: "commitment_followup",
  title: "推进：Commitment",
  expectedOutcome: "Commitment advances.",
  reversibility: "reversible" as const,
  requiredAuthority: "suggest" as const,
  input: {},
  status: "authorized" as const,
  createdAt: nowIso,
  updatedAt: nowIso,
};
const authorization = {
  id: "authorization-1",
  proposalId: "proposal-1",
  profileId: "profile-1",
  mode: "execute" as const,
  grantedBy: "user" as const,
  constraints: {},
  expiresAt: null,
  revokedAt: null,
  createdAt: nowIso,
};
const config = {
  enabled: true,
  tickMs: 1000,
  limitPerProfile: 1,
  leaseMs: 30_000,
};

describe("executeClaimedActionRun", () => {
  test("applies a candidate-bound local reversible action and records receipt", async () => {
    const completed: Record<string, unknown>[] = [];
    const statuses: string[] = [];
    const result = await runRepo(
      executeClaimedActionRun({
        nowIso,
        actionRun,
        config,
        workerId: "worker-1",
        deps: {
          claimActionRun: () =>
            Effect.succeed({
              ...actionRun,
              status: "claimed" as const,
            } as never),
          startActionRun: () =>
            Effect.succeed({
              ...actionRun,
              status: "running" as const,
            } as never),
          getActionProposal: () => Effect.succeed(proposal),
          getActionAuthorization: () => Effect.succeed(authorization),
          updateCommitmentStatus: () =>
            Effect.succeed({
              id: "commitment-1",
              profileId: "profile-1",
              goalId: "goal-1",
              kind: "task",
              status: "done",
              owner: "user",
              title: "Commitment",
              dueAt: null,
              evidenceIds: [],
              createdAt: nowIso,
              updatedAt: nowIso,
            } as never),
          completeActionRun: (_id, result, receipt) =>
            Effect.sync(() => {
              completed.push({ ...result, receipt: receipt.kind });
              return null as never;
            }),
          updateActionProposalStatus: (_id, status) =>
            Effect.sync(() => {
              statuses.push(status);
              return proposal as never;
            }),
          appendEvent: () => Effect.succeed(null as never),
        },
      })
    );
    expect(result).toEqual({ claimed: true, succeeded: true, failed: false });
    expect(completed).toMatchObject([
      { receipt: "local_commitment_state_updated", nextStatus: "done" },
    ]);
    expect(statuses).toEqual(["completed"]);
  });
  test("fails before mutation when execution authorization is revoked", async () => {
    let mutated = false;
    const result = await runRepo(
      executeClaimedActionRun({
        nowIso,
        actionRun,
        config,
        workerId: "worker-1",
        deps: {
          claimActionRun: () =>
            Effect.succeed({
              ...actionRun,
              status: "claimed" as const,
            } as never),
          startActionRun: () =>
            Effect.succeed({
              ...actionRun,
              status: "running" as const,
            } as never),
          getActionProposal: () => Effect.succeed(proposal),
          getActionAuthorization: () =>
            Effect.succeed({
              ...authorization,
              revokedAt: nowIso,
            } as never),
          updateCommitmentStatus: () =>
            Effect.sync(() => {
              mutated = true;
              return null as never;
            }),
          failActionRun: () => Effect.succeed(null as never),
          appendEvent: () => Effect.succeed(null as never),
        },
      })
    );
    expect(result.failed).toBe(true);
    expect(mutated).toBe(false);
  });
  test("records Telegram transport acceptance as awaiting external confirmation", async () => {
    const completed: Record<string, unknown>[] = [];
    const result = await runRepo(
      executeClaimedActionRun({
        nowIso,
        actionRun: {
          ...actionRun,
          input: {
            operation: "telegram_message_send",
            messageKind: "daily_summary",
            targetAlias: "daily_digest",
            targetId: null,
            text: "Daily summary",
          },
        },
        config,
        workerId: "worker-1",
        deps: {
          claimActionRun: () =>
            Effect.succeed({
              ...actionRun,
              status: "claimed" as const,
              input: {
                operation: "telegram_message_send" as const,
                messageKind: "daily_summary" as const,
                targetAlias: "daily_digest",
                targetId: null,
                text: "Daily summary",
              },
            } as never),
          startActionRun: () =>
            Effect.succeed({
              ...actionRun,
              status: "running" as const,
            } as never),
          getActionProposal: () =>
            Effect.succeed({
              ...proposal,
              kind: "telegram_message",
              reversibility: "irreversible",
              input: {
                messageKind: "daily_summary",
                targetAlias: "daily_digest",
                targetId: null,
                text: "Daily summary",
              },
            } as never),
          getEffectiveTelegramConfig: async () =>
            ({
              enabled: true,
              targets: [
                {
                  alias: "daily_digest",
                  targetType: "channel",
                  enabled: true,
                },
              ],
            }) as never,
          getActionAuthorization: () =>
            Effect.succeed({
              ...authorization,
              constraints: {
                platform: "telegram",
                targetAlias: "daily_digest",
                requiresConfirmation: true,
              },
            } as never),
          sendTelegramMessage: async () => ({
            delivered: true,
            messageId: "42",
            target: {
              platform: "telegram" as const,
              targetAlias: "daily_digest",
              targetId: "-100",
            },
            preview: "Daily summary",
          }),
          completeActionRun: (_id, result, receipt) =>
            Effect.sync(() => {
              completed.push({ ...result, receiptStatus: receipt.status });
              return null as never;
            }),
          updateActionProposalStatus: () => Effect.succeed(proposal as never),
          appendEvent: () => Effect.succeed(null as never),
        },
      })
    );
    expect(result).toEqual({ claimed: true, succeeded: true, failed: false });
    expect(completed).toMatchObject([
      {
        operation: "telegram_message_send",
        messageId: "42",
        receiptStatus: "external_unconfirmed",
      },
    ]);
  });
  test("does not send if the authorized alias is no longer a configured channel", async () => {
    let sent = false;
    const result = await runRepo(
      executeClaimedActionRun({
        nowIso,
        actionRun: {
          ...actionRun,
          input: {
            operation: "telegram_message_send",
            messageKind: "daily_summary",
            targetAlias: "daily_digest",
            targetId: null,
            text: "Daily summary",
          },
        },
        config,
        workerId: "worker-1",
        deps: {
          claimActionRun: () =>
            Effect.succeed({
              ...actionRun,
              status: "claimed" as const,
              input: {
                operation: "telegram_message_send" as const,
                messageKind: "daily_summary" as const,
                targetAlias: "daily_digest",
                targetId: null,
                text: "Daily summary",
              },
            } as never),
          startActionRun: () =>
            Effect.succeed({
              ...actionRun,
              status: "running" as const,
            } as never),
          getActionProposal: () =>
            Effect.succeed({
              ...proposal,
              kind: "telegram_message",
              reversibility: "irreversible",
              input: {
                messageKind: "daily_summary",
                targetAlias: "daily_digest",
                targetId: null,
                text: "Daily summary",
              },
            } as never),
          getActionAuthorization: () =>
            Effect.succeed({
              ...authorization,
              constraints: {
                platform: "telegram",
                targetAlias: "daily_digest",
                requiresConfirmation: true,
              },
            } as never),
          getEffectiveTelegramConfig: async () =>
            ({
              enabled: true,
              targets: [
                {
                  alias: "daily_digest",
                  targetType: "group",
                  enabled: true,
                },
              ],
            }) as never,
          sendTelegramMessage: async () => {
            sent = true;
            throw new Error("must not send");
          },
          failActionRun: () => Effect.succeed(null as never),
          appendEvent: () => Effect.succeed(null as never),
        },
      })
    );
    expect(result.failed).toBe(true);
    expect(sent).toBe(false);
  });
});
