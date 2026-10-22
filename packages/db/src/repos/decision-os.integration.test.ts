import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

import { getClient } from "../client";
import { runRepo } from "../run";
import {
  executeStatements,
  setupTestDatabase,
  type TestDatabase,
} from "../testing/test-database";
import {
  createActionAuthorization,
  createActionProposal,
  listActionAuthorizationsByProposal,
} from "./action-proposals";
import {
  claimActionRun,
  completeActionRun,
  confirmActionRunReceipt,
  createActionRun,
  getActionRun,
  listClaimableActionRuns,
  startActionRun,
} from "./action-runs";
import {
  getDecisionTrace,
  recordDecisionFeedback,
  recordDecisionTrace,
} from "./decisions";
import { createCommitment, createGoal } from "./goals";

let testDatabase: TestDatabase;

const resetTables = () =>
  executeStatements([
    "DELETE FROM action_runs",
    "DELETE FROM action_authorizations",
    "DELETE FROM action_proposals",
    "DELETE FROM decision_feedback",
    "DELETE FROM decision_judgments",
    "DELETE FROM decision_candidates",
    "DELETE FROM decisions",
    "DELETE FROM commitments",
    "DELETE FROM goals",
    "DELETE FROM profiles",
    "DELETE FROM `user`",
  ]);

const seedProfile = async () => {
  const client = getClient();
  const now = Date.now();

  await client.execute({
    sql: "INSERT INTO `user` (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
    args: ["user-1", "Test", "decision@example.com", now, now],
  });

  await client.execute({
    sql: "INSERT INTO profiles (id, owner_user_id, name, kind, timezone, created_at, updated_at) VALUES (?, ?, ?, 'personal', ?, ?, ?)",
    args: [
      "profile-1",
      "user-1",
      "Test",
      "Asia/Shanghai",
      "2026-10-21T00:00:00.000Z",
      "2026-10-21T00:00:00.000Z",
    ],
  });
};

describe("Decision OS repositories", () => {
  beforeAll(async () => {
    testDatabase = await setupTestDatabase("decision-os");
  });

  beforeEach(async () => {
    await resetTables();
    await seedProfile();
  });

  afterAll(() => {
    testDatabase.cleanup();
  });

  test("persists a goal, commitment, and replayable decision trace", async () => {
    const goal = await runRepo(
      createGoal({
        profileId: "profile-1",
        title: "Ship Decision OS",
        desiredOutcome: "A traceable decision foundation exists.",
        status: "active",
        horizon: "project",
        successCriteria: [
          { id: "criterion-1", description: "Trace stored", satisfied: false },
        ],
        constraints: [],
        autonomyMode: "collaborate",
        planVersion: 0,
        nextReviewAt: null,
      })
    );
    const commitment = await runRepo(
      createCommitment({
        profileId: "profile-1",
        goalId: goal.id,
        kind: "task",
        status: "open",
        owner: "buni",
        title: "Persist decision trace",
        dueAt: null,
        evidenceIds: [],
      })
    );
    expect(commitment.goalId).toBe(goal.id);
    const decision = await runRepo(
      recordDecisionTrace({
        decision: {
          profileId: "profile-1",
          goalId: goal.id,
          kind: "initiative",
          trigger: "goal_created",
          stateFingerprint: "state-v1",
          route: "suggest",
          policyResult: {
            permitted: true,
            route: "suggest",
            reasons: ["not_reversible"],
            policyVersion: "v1",
          },
        },
        candidates: [
          {
            id: "candidate-1",
            kind: "next_action",
            title: "Implement storage",
            rationale: "Unblocks the foundation",
            reversibility: "reversible",
            authority: "suggest",
            eligible: true,
          },
        ],
        judgments: [
          {
            provider: "heuristic",
            providerVersion: "baseline-v1",
            questionId: "initiative.interruption_value",
            kind: "score",
            selectedValue: 3,
            probabilities: { low: 0.1, high: 0.9 },
            confidence: 0.9,
          },
        ],
      })
    );
    const trace = await runRepo(getDecisionTrace(decision.id));
    expect(trace?.decision.policyResult.reasons).toEqual(["not_reversible"]);
    expect(trace?.candidates).toHaveLength(1);
    expect(trace?.judgments).toHaveLength(1);
    await runRepo(
      recordDecisionFeedback({
        decisionId: decision.id,
        profileId: "profile-1",
        kind: "accepted",
        candidateId: "candidate-1",
        note: "Proceed.",
      })
    );
    expect(
      (await runRepo(getDecisionTrace(decision.id)))?.feedback
    ).toMatchObject([{ kind: "accepted", candidateId: "candidate-1" }]);
    const proposal = await runRepo(
      createActionProposal({
        profileId: "profile-1",
        goalId: goal.id,
        decisionId: decision.id,
        candidateId: "candidate-1",
        kind: "next_action",
        title: "Implement storage",
        expectedOutcome: "A reviewable proposal exists.",
        reversibility: "reversible",
        requiredAuthority: "confirmation",
        input: { source: "test" },
        status: "proposed",
      })
    );
    const authorization = await runRepo(
      createActionAuthorization({
        proposalId: proposal.id,
        profileId: "profile-1",
        mode: "request_confirmation",
        grantedBy: "user",
        constraints: { expires: "one review" },
        expiresAt: null,
      })
    );
    expect(
      await runRepo(
        listActionAuthorizationsByProposal("profile-1", proposal.id)
      )
    ).toMatchObject([
      { proposalId: proposal.id, mode: "request_confirmation" },
    ]);
    const actionRun = await runRepo(
      createActionRun({
        profileId: "profile-1",
        proposalId: proposal.id,
        authorizationId: authorization.id,
        input: {
          operation: "commitment_status_update",
          commitmentId: commitment.id,
          expectedStatus: "open",
          nextStatus: "done",
        },
      })
    );
    expect(await runRepo(getActionRun(actionRun.id))).toMatchObject({
      proposalId: proposal.id,
      status: "queued",
      idempotencyKey: `action-run:${actionRun.id}`,
      checkpoint: { phase: "queued" },
    });
    const firstClaim = await runRepo(
      claimActionRun({
        actionRunId: actionRun.id,
        nowIso: "2026-10-21T00:00:00.000Z",
        leaseOwner: "worker-1",
        leaseExpiresAt: "2026-10-21T00:00:30.000Z",
      })
    );
    const competingClaim = await runRepo(
      claimActionRun({
        actionRunId: actionRun.id,
        nowIso: "2026-10-21T00:00:00.000Z",
        leaseOwner: "worker-2",
        leaseExpiresAt: "2026-10-21T00:00:30.000Z",
      })
    );
    expect(firstClaim?.leaseOwner).toBe("worker-1");
    expect(firstClaim?.checkpoint).toMatchObject({ phase: "claimed" });
    expect(competingClaim).toBeNull();
    expect(
      await runRepo(
        listClaimableActionRuns({
          profileId: "profile-1",
          nowIso: "2026-10-21T00:01:00.000Z",
          limit: 10,
        })
      )
    ).toMatchObject([{ id: actionRun.id, status: "claimed" }]);
    expect(
      await runRepo(startActionRun(actionRun.id, "2026-10-21T00:01:00.000Z"))
    ).toMatchObject({
      status: "running",
      checkpoint: { phase: "running" },
    });
    await runRepo(
      completeActionRun(
        actionRun.id,
        { operation: "commitment_status_update" },
        {
          kind: "local_commitment_state_updated",
          status: "local_confirmed",
          confirmedAt: "2026-10-21T00:01:01.000Z",
          evidence: { commitmentId: commitment.id },
        },
        "2026-10-21T00:01:01.000Z"
      )
    );
    expect(await runRepo(getActionRun(actionRun.id))).toMatchObject({
      status: "succeeded",
      checkpoint: { phase: "completed" },
      receipt: {
        kind: "local_commitment_state_updated",
        status: "local_confirmed",
      },
    });
    await getClient().execute({
      sql: "UPDATE action_runs SET receipt_json = ? WHERE id = ?",
      args: [
        JSON.stringify({
          kind: "telegram_send_message",
          status: "external_unconfirmed",
          confirmedAt: null,
          evidence: { messageId: "telegram-message-1" },
        }),
        actionRun.id,
      ],
    });
    expect(
      await runRepo(
        confirmActionRunReceipt(actionRun.id, "2026-10-21T00:01:02.000Z")
      )
    ).toMatchObject({
      checkpoint: { phase: "externally_confirmed" },
      receipt: {
        kind: "telegram_send_message",
        status: "external_confirmed",
        confirmedAt: "2026-10-21T00:01:02.000Z",
      },
    });
    expect(await runRepo(confirmActionRunReceipt(actionRun.id))).toBeNull();
  });
});
