import type { Commitment, DecisionCandidate, Goal } from "@neobuni/contracts";

const candidatePriority = (candidate: DecisionCandidate) =>
  candidate.title.startsWith("处理阻塞：") ? 0 : 1;

const orderNextActionCandidates = (candidates: DecisionCandidate[]) =>
  [...candidates].sort(
    (left, right) =>
      candidatePriority(left) - candidatePriority(right) ||
      left.id.localeCompare(right.id)
  );

const buildNextActionCandidates = (input: {
  goals: Goal[];
  commitments: Commitment[];
}): DecisionCandidate[] =>
  orderNextActionCandidates(
    input.goals.flatMap((goal) => {
      const candidates = input.commitments.filter(
        (commitment) =>
          commitment.goalId === goal.id &&
          (commitment.status === "open" || commitment.status === "blocked")
      );
      return candidates.map((commitment) => ({
        id: `commitment:${commitment.id}`,
        kind: "commitment_followup",
        title:
          commitment.status === "blocked"
            ? `处理阻塞：${commitment.title}`
            : `推进：${commitment.title}`,
        rationale: `关联活跃目标「${goal.title}」。`,
        reversibility: "reversible" as const,
        authority: "suggest" as const,
        eligible: true,
      }));
    })
  );

const selectHeuristicNextAction = (candidates: DecisionCandidate[]) =>
  orderNextActionCandidates(candidates)[0] ?? null;

export {
  buildNextActionCandidates,
  orderNextActionCandidates,
  selectHeuristicNextAction,
};
