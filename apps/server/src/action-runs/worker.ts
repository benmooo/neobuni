import {
  isActionAuthorizedForExecution,
  isProposalInputBoundToCandidate,
} from "@neobuni/core";
import {
  appendEvent,
  claimActionRun,
  completeActionRun,
  failActionRun,
  getActionAuthorization,
  getActionProposal,
  listActiveProfiles,
  listClaimableActionRuns,
  startActionRun,
  updateActionProposalStatus,
  updateCommitmentStatus,
} from "@neobuni/db";
import { Effect, tryPromise } from "../effect";
import {
  getEffectiveTelegramConfig,
  sendTelegramMessage,
} from "../integrations/telegram";

interface ActionRunWorkerConfig {
  enabled: boolean;
  leaseMs: number;
  limitPerProfile: number;
  tickMs: number;
}

interface ActionRunExecutionResult {
  claimed: boolean;
  failed: boolean;
  succeeded: boolean;
}

interface ActionRunWorkerDeps {
  appendEvent: typeof appendEvent;
  claimActionRun: typeof claimActionRun;
  completeActionRun: typeof completeActionRun;
  failActionRun: typeof failActionRun;
  getActionAuthorization: typeof getActionAuthorization;
  getActionProposal: typeof getActionProposal;
  getEffectiveTelegramConfig: typeof getEffectiveTelegramConfig;
  listActiveProfiles: typeof listActiveProfiles;
  listClaimableActionRuns: typeof listClaimableActionRuns;
  sendTelegramMessage: typeof sendTelegramMessage;
  startActionRun: typeof startActionRun;
  updateActionProposalStatus: typeof updateActionProposalStatus;
  updateCommitmentStatus: typeof updateCommitmentStatus;
}

const defaultConfig: ActionRunWorkerConfig = {
  enabled: true,
  tickMs: 10_000,
  limitPerProfile: 10,
  leaseMs: 30_000,
};
const defaultDeps: ActionRunWorkerDeps = {
  appendEvent,
  claimActionRun,
  completeActionRun,
  failActionRun,
  getActionAuthorization,
  getActionProposal,
  getEffectiveTelegramConfig,
  listActiveProfiles,
  listClaimableActionRuns,
  startActionRun,
  sendTelegramMessage,
  updateActionProposalStatus,
  updateCommitmentStatus,
};
const toBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(value.trim().toLowerCase())) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value.trim().toLowerCase())) {
    return false;
  }
  return fallback;
};
const toPositiveInt = (
  value: string | undefined,
  fallback: number,
  min: number
) => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(min, Math.trunc(parsed)) : fallback;
};
const readActionRunWorkerConfig = (): ActionRunWorkerConfig => ({
  enabled: toBoolean(
    process.env.NEOBUNI_ACTION_RUN_WORKER_ENABLED,
    defaultConfig.enabled
  ),
  tickMs: toPositiveInt(
    process.env.NEOBUNI_ACTION_RUN_WORKER_TICK_MS,
    defaultConfig.tickMs,
    1000
  ),
  limitPerProfile: toPositiveInt(
    process.env.NEOBUNI_ACTION_RUN_WORKER_LIMIT_PER_PROFILE,
    defaultConfig.limitPerProfile,
    1
  ),
  leaseMs: toPositiveInt(
    process.env.NEOBUNI_ACTION_RUN_WORKER_LEASE_MS,
    defaultConfig.leaseMs,
    5000
  ),
});

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const failClaimedActionRun = Effect.fnUntraced(function* (input: {
  actionRunId: string;
  profileId: string;
  proposalId: string;
  message: string;
  deps: ActionRunWorkerDeps;
}) {
  const nowIso = new Date().toISOString();
  yield* input.deps.failActionRun(
    input.actionRunId,
    { message: input.message },
    nowIso
  );
  yield* input.deps.appendEvent(input.profileId, "action_run.failed", {
    actionRunId: input.actionRunId,
    proposalId: input.proposalId,
    error: input.message,
  });
  return { claimed: true, succeeded: false, failed: true };
});

const executeClaimedActionRun = Effect.fnUntraced(function* (input: {
  nowIso: string;
  actionRun: Effect.Success<ReturnType<typeof listClaimableActionRuns>>[number];
  config: ActionRunWorkerConfig;
  workerId: string;
  deps?: Partial<ActionRunWorkerDeps>;
}) {
  const deps = { ...defaultDeps, ...input.deps };
  const claimed = yield* deps.claimActionRun({
    actionRunId: input.actionRun.id,
    nowIso: input.nowIso,
    leaseOwner: input.workerId,
    leaseExpiresAt: new Date(
      Date.parse(input.nowIso) + input.config.leaseMs
    ).toISOString(),
  });
  if (!claimed) {
    return { claimed: false, succeeded: false, failed: false };
  }
  const started = yield* deps.startActionRun(claimed.id, input.nowIso);
  if (!started) {
    return { claimed: true, succeeded: false, failed: false };
  }
  yield* deps.appendEvent(claimed.profileId, "action_run.started", {
    actionRunId: claimed.id,
    proposalId: claimed.proposalId,
  });
  const [proposal, authorization] = yield* Effect.all([
    deps.getActionProposal(claimed.proposalId),
    deps.getActionAuthorization(claimed.authorizationId),
  ]);
  if (
    !(proposal && authorization) ||
    proposal.profileId !== claimed.profileId
  ) {
    return yield* failClaimedActionRun({
      actionRunId: claimed.id,
      profileId: claimed.profileId,
      proposalId: claimed.proposalId,
      message: "Missing action proposal or authorization",
      deps,
    });
  }
  if (
    !isActionAuthorizedForExecution({
      authorization,
      proposal,
      action: claimed.input,
      nowIso: input.nowIso,
    })
  ) {
    return yield* failClaimedActionRun({
      actionRunId: claimed.id,
      profileId: claimed.profileId,
      proposalId: claimed.proposalId,
      message: "Authorization is no longer eligible for execution",
      deps,
    });
  }
  if (!isProposalInputBoundToCandidate({ proposal, action: claimed.input })) {
    return yield* failClaimedActionRun({
      actionRunId: claimed.id,
      profileId: claimed.profileId,
      proposalId: claimed.proposalId,
      message: "Action input is not bound to its decision candidate",
      deps,
    });
  }

  const completedAt = new Date().toISOString();
  if (claimed.input.operation === "telegram_message_send") {
    const telegramInput = claimed.input;
    const telegramConfig = yield* tryPromise("getEffectiveTelegramConfig", () =>
      deps.getEffectiveTelegramConfig(claimed.profileId)
    );
    const configuredChannel = telegramInput.targetAlias
      ? telegramConfig.targets.find(
          (target) =>
            target.alias === telegramInput.targetAlias &&
            target.enabled &&
            target.targetType === "channel"
        )
      : null;
    if (
      !(telegramConfig.enabled && configuredChannel) ||
      telegramInput.targetId !== null
    ) {
      return yield* failClaimedActionRun({
        actionRunId: claimed.id,
        profileId: claimed.profileId,
        proposalId: claimed.proposalId,
        message: "Telegram target is no longer an enabled configured channel",
        deps,
      });
    }
    const delivery = yield* tryPromise("sendTelegramMessage", () =>
      deps.sendTelegramMessage(claimed.profileId, {
        ...(telegramInput.targetAlias
          ? { targetAlias: telegramInput.targetAlias }
          : {}),
        ...(telegramInput.targetId ? { targetId: telegramInput.targetId } : {}),
        message: { type: "text", text: telegramInput.text },
      })
    );
    if (!(delivery.delivered && delivery.messageId)) {
      return yield* failClaimedActionRun({
        actionRunId: claimed.id,
        profileId: claimed.profileId,
        proposalId: claimed.proposalId,
        message: "Telegram did not return a message receipt",
        deps,
      });
    }
    const result = {
      operation: claimed.input.operation,
      platform: "telegram",
      targetAlias: delivery.target.targetAlias,
      targetId: delivery.target.targetId,
      messageId: delivery.messageId,
    };
    yield* deps.completeActionRun(
      claimed.id,
      result,
      {
        kind: "telegram_send_message",
        status: "external_unconfirmed",
        confirmedAt: null,
        evidence: result,
      },
      completedAt
    );
    yield* deps.updateActionProposalStatus(
      claimed.proposalId,
      "completed",
      completedAt
    );
    yield* deps.appendEvent(
      claimed.profileId,
      "action_run.awaiting_confirmation",
      {
        actionRunId: claimed.id,
        proposalId: claimed.proposalId,
        ...result,
      }
    );
    return { claimed: true, succeeded: true, failed: false };
  }
  const commitment = yield* deps.updateCommitmentStatus({
    profileId: claimed.profileId,
    commitmentId: claimed.input.commitmentId,
    expectedStatus: claimed.input.expectedStatus,
    nextStatus: claimed.input.nextStatus,
    updatedAt: completedAt,
  });
  if (!commitment) {
    return yield* failClaimedActionRun({
      actionRunId: claimed.id,
      profileId: claimed.profileId,
      proposalId: claimed.proposalId,
      message: "Commitment was missing or changed before the action ran",
      deps,
    });
  }
  const result = {
    operation: claimed.input.operation,
    commitmentId: commitment.id,
    previousStatus: claimed.input.expectedStatus,
    nextStatus: commitment.status,
  };
  yield* deps.completeActionRun(
    claimed.id,
    result,
    {
      kind: "local_commitment_state_updated",
      status: "local_confirmed",
      confirmedAt: completedAt,
      evidence: {
        commitmentId: commitment.id,
        previousStatus: claimed.input.expectedStatus,
        nextStatus: commitment.status,
      },
    },
    completedAt
  );
  yield* deps.updateActionProposalStatus(
    claimed.proposalId,
    "completed",
    completedAt
  );
  yield* deps.appendEvent(claimed.profileId, "action_run.succeeded", {
    actionRunId: claimed.id,
    proposalId: claimed.proposalId,
    ...result,
    receipt: "local_commitment_state_updated",
  });
  return { claimed: true, succeeded: true, failed: false };
});

const runActionRunWorkerSweep = Effect.fnUntraced(function* (input?: {
  nowIso?: string;
  config?: ActionRunWorkerConfig;
  profileIds?: string[];
  deps?: Partial<ActionRunWorkerDeps>;
}) {
  const deps = { ...defaultDeps, ...input?.deps };
  const nowIso = input?.nowIso ?? new Date().toISOString();
  const config = input?.config ?? readActionRunWorkerConfig();
  const workerId = `action-run-worker:${nowIso}`;
  const profileIds = input?.profileIds;
  const activeProfiles = yield* deps.listActiveProfiles();
  const profiles = activeProfiles.filter(
    (profile) => profileIds === undefined || profileIds.includes(profile.id)
  );
  const profileResults = yield* Effect.all(
    profiles.map((profile) =>
      Effect.gen(function* () {
        const actionRuns = yield* deps.listClaimableActionRuns({
          nowIso,
          profileId: profile.id,
          limit: config.limitPerProfile,
        });
        const results: ActionRunExecutionResult[] = [];
        for (const actionRun of actionRuns) {
          results.push(
            yield* executeClaimedActionRun({
              nowIso,
              actionRun,
              config,
              workerId,
              deps,
            })
          );
        }
        return {
          profileId: profile.id,
          claimableCount: actionRuns.length,
          succeededCount: results.filter((result) => result.succeeded).length,
          failedCount: results.filter((result) => result.failed).length,
        };
      })
    ),
    { concurrency: "unbounded" }
  );
  return { startedAt: nowIso, profileResults };
});

const actionRunWorkerTick = (config: ActionRunWorkerConfig) =>
  runActionRunWorkerSweep({ config }).pipe(
    Effect.catchIf(
      () => true,
      (error) =>
        Effect.logError(`[buni/action-run-worker] ${describeError(error)}`)
    ),
    Effect.catchDefect((defect) =>
      Effect.logError(`[buni/action-run-worker] ${describeError(defect)}`)
    )
  );

const startActionRunWorker = Effect.fn("startActionRunWorker")(function* () {
  const config = readActionRunWorkerConfig();
  if (!config.enabled) {
    yield* Effect.logInfo("[buni/action-run-worker] disabled");
    return;
  }
  yield* Effect.logInfo(
    `[buni/action-run-worker] started tickMs=${config.tickMs} limitPerProfile=${config.limitPerProfile}`
  );
  yield* actionRunWorkerTick(config);

  yield* Effect.forever(
    Effect.andThen(Effect.sleep(config.tickMs), () =>
      actionRunWorkerTick(config)
    )
  );
});

export type {
  ActionRunExecutionResult,
  ActionRunWorkerConfig,
  ActionRunWorkerDeps,
};
export {
  executeClaimedActionRun,
  readActionRunWorkerConfig,
  runActionRunWorkerSweep,
  startActionRunWorker,
};
