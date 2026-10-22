import { describe, expect, test } from "vitest"
import {
  isActionAuthorizedForExecution,
  isActiveExecutionAuthorization,
  isProposalInputBoundToCandidate,
} from "./action-policy"

const nowIso = "2026-10-21T00:00:00.000Z"
const proposal = {
  id: "proposal-1",
  profileId: "profile-1",
  goalId: null,
  decisionId: "decision-1",
  candidateId: "commitment:commitment-1",
  kind: "commitment_followup",
  title: "推进",
  expectedOutcome: "完成",
  reversibility: "reversible" as const,
  requiredAuthority: "suggest" as const,
  input: {},
  status: "authorized" as const,
  createdAt: nowIso,
  updatedAt: nowIso,
}
const authorization = {
  id: "authorization-1",
  proposalId: proposal.id,
  profileId: proposal.profileId,
  mode: "execute" as const,
  grantedBy: "user" as const,
  constraints: {},
  expiresAt: null,
  revokedAt: null,
  createdAt: nowIso,
}

describe("action execution policy", () => {
  test("requires a live explicit user execution grant", () => {
    expect(
      isActiveExecutionAuthorization({ authorization, proposal, nowIso }),
    ).toBe(true)
    expect(
      isActiveExecutionAuthorization({
        authorization: { ...authorization, revokedAt: nowIso },
        proposal,
        nowIso,
      }),
    ).toBe(false)
  })
  test("binds the local state update to the original commitment candidate", () => {
    expect(
      isProposalInputBoundToCandidate({
        proposal,
        action: {
          operation: "commitment_status_update",
          commitmentId: "commitment-1",
          expectedStatus: "open",
          nextStatus: "done",
        },
      }),
    ).toBe(true)
    expect(
      isProposalInputBoundToCandidate({
        proposal,
        action: {
          operation: "commitment_status_update",
          commitmentId: "other",
          expectedStatus: "open",
          nextStatus: "done",
        },
      }),
    ).toBe(false)
  })
  test("requires a per-send Telegram target confirmation", () => {
    const action = {
      operation: "telegram_message_send" as const,
      messageKind: "daily_summary" as const,
      targetAlias: "daily_digest",
      targetId: null,
      text: "Daily summary",
    }
    const telegramProposal = {
      ...proposal,
      kind: "telegram_message",
      reversibility: "irreversible" as const,
      input: { ...action },
    }
    expect(
      isActionAuthorizedForExecution({
        authorization: {
          ...authorization,
          constraints: {
            platform: "telegram",
            targetAlias: "daily_digest",
            requiresConfirmation: true,
          },
        },
        proposal: telegramProposal,
        action,
        nowIso,
      }),
    ).toBe(true)
    expect(
      isActionAuthorizedForExecution({
        authorization,
        proposal: telegramProposal,
        action,
        nowIso,
      }),
    ).toBe(false)
  })
})
