import type {
	Decision,
	DecisionAnswer,
	DecisionCandidate,
	DecisionFeedback,
	PolicyResult,
} from "@neobuni/contracts";
import { asc, desc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { db, fromPromise } from "../client";
import {
	decisionCandidatesTable,
	decisionFeedbackTable,
	decisionJudgmentsTable,
	decisionsTable,
} from "../schema";

const parseJson = <T>(value: string, fallback: T): T => {
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
};

const recordDecisionTrace = Effect.fnUntraced(function* (input: {
	decision: Omit<Decision, "id" | "createdAt"> & {
		id?: string;
		createdAt?: string;
	};
	candidates: DecisionCandidate[];
	judgments: Array<
		DecisionAnswer & {
			provider: "heuristic" | "jev" | "system_two" | "policy";
			providerVersion: string;
			latencyMs?: number | null;
		}
	>;
}) {
	const createdAt = input.decision.createdAt ?? new Date().toISOString();
	const decisionId = input.decision.id ?? crypto.randomUUID();
	const record = {
		id: decisionId,
		profileId: input.decision.profileId,
		goalId: input.decision.goalId,
		kind: input.decision.kind,
		trigger: input.decision.trigger,
		stateFingerprint: input.decision.stateFingerprint,
		route: input.decision.route,
		permitted: input.decision.policyResult.permitted ? 1 : 0,
		policyVersion: input.decision.policyResult.policyVersion,
		policyReasonsJson: JSON.stringify(input.decision.policyResult.reasons),
		createdAt,
	};
	yield* fromPromise("recordDecisionTrace", () =>
		db.insert(decisionsTable).values(record)
	);
	if (input.candidates.length > 0) {
		yield* fromPromise("recordDecisionTrace", () =>
			db.insert(decisionCandidatesTable).values(
				input.candidates.map((candidate) => ({
					id: candidate.id,
					decisionId,
					kind: candidate.kind,
					title: candidate.title,
					rationale: candidate.rationale,
					reversibility: candidate.reversibility,
					authority: candidate.authority,
					eligible: candidate.eligible ? 1 : 0,
					createdAt,
				}))
			)
		);
	}
	if (input.judgments.length > 0) {
		yield* fromPromise("recordDecisionTrace", () =>
			db.insert(decisionJudgmentsTable).values(
				input.judgments.map((judgment) => ({
					id: crypto.randomUUID(),
					decisionId,
					provider: judgment.provider,
					providerVersion: judgment.providerVersion,
					questionId: judgment.questionId,
					kind: judgment.kind,
					selectedValueJson: JSON.stringify(judgment.selectedValue),
					probabilitiesJson: JSON.stringify(judgment.probabilities),
					confidence: judgment.confidence,
					latencyMs: judgment.latencyMs ?? null,
					createdAt,
				}))
			)
		);
	}
	return { ...input.decision, id: decisionId, createdAt };
});

const recordDecisionFeedback = Effect.fnUntraced(function* (
	input: Omit<DecisionFeedback, "id" | "createdAt"> & {
		id?: string;
		createdAt?: string;
	}
) {
	const feedback = {
		id: input.id ?? crypto.randomUUID(),
		decisionId: input.decisionId,
		profileId: input.profileId,
		kind: input.kind,
		candidateId: input.candidateId,
		note: input.note,
		createdAt: input.createdAt ?? new Date().toISOString(),
	};
	yield* fromPromise("recordDecisionFeedback", () =>
		db.insert(decisionFeedbackTable).values(feedback)
	);
	return feedback;
});

const getDecisionTrace = Effect.fnUntraced(function* (decisionId: string) {
	const decision = yield* fromPromise("getDecisionTrace", () =>
		db
			.select()
			.from(decisionsTable)
			.where(eq(decisionsTable.id, decisionId))
			.limit(1)
			.then((rows) => rows[0] ?? null)
	);
	if (!decision) {
		return null;
	}
	const [candidates, judgments, feedback] = yield* Effect.all(
		[
			fromPromise("getDecisionTrace", () =>
				db
					.select()
					.from(decisionCandidatesTable)
					.where(eq(decisionCandidatesTable.decisionId, decisionId))
					.orderBy(asc(decisionCandidatesTable.createdAt))
			),
			fromPromise("getDecisionTrace", () =>
				db
					.select()
					.from(decisionJudgmentsTable)
					.where(eq(decisionJudgmentsTable.decisionId, decisionId))
					.orderBy(asc(decisionJudgmentsTable.createdAt))
			),
			fromPromise("getDecisionTrace", () =>
				db
					.select()
					.from(decisionFeedbackTable)
					.where(eq(decisionFeedbackTable.decisionId, decisionId))
					.orderBy(asc(decisionFeedbackTable.createdAt))
			),
		],
		{ concurrency: "unbounded" }
	);
	const policyResult: PolicyResult = {
		permitted: decision.permitted === 1,
		route: decision.route as PolicyResult["route"],
		reasons: parseJson(decision.policyReasonsJson, []),
		policyVersion: decision.policyVersion,
	};
	return {
		decision: {
			id: decision.id,
			profileId: decision.profileId,
			goalId: decision.goalId,
			kind: decision.kind as Decision["kind"],
			trigger: decision.trigger,
			stateFingerprint: decision.stateFingerprint,
			route: decision.route as Decision["route"],
			policyResult,
			createdAt: decision.createdAt,
		},
		candidates: candidates.map((candidate) => ({
			id: candidate.id,
			kind: candidate.kind,
			title: candidate.title,
			rationale: candidate.rationale,
			reversibility:
				candidate.reversibility as DecisionCandidate["reversibility"],
			authority: candidate.authority as DecisionCandidate["authority"],
			eligible: candidate.eligible === 1,
		})),
		judgments: judgments.map((judgment) => ({
			provider: judgment.provider as
				| "heuristic"
				| "jev"
				| "system_two"
				| "policy",
			providerVersion: judgment.providerVersion,
			questionId: judgment.questionId,
			kind: judgment.kind as DecisionAnswer["kind"],
			selectedValue: parseJson<DecisionAnswer["selectedValue"]>(
				judgment.selectedValueJson,
				false
			),
			probabilities: parseJson<DecisionAnswer["probabilities"]>(
				judgment.probabilitiesJson,
				{}
			),
			confidence: judgment.confidence,
			latencyMs: judgment.latencyMs,
		})),
		feedback: feedback.map((item) => ({
			id: item.id,
			decisionId: item.decisionId,
			profileId: item.profileId,
			kind: item.kind as DecisionFeedback["kind"],
			candidateId: item.candidateId,
			note: item.note,
			createdAt: item.createdAt,
		})),
	};
});

const listDecisionTracesByProfile = Effect.fnUntraced(function* (
	profileId: string
) {
	const decisions = yield* fromPromise("listDecisionTracesByProfile", () =>
		db
			.select({ id: decisionsTable.id })
			.from(decisionsTable)
			.where(eq(decisionsTable.profileId, profileId))
	);
	const traces = yield* Effect.all(
		decisions.map(({ id }) => getDecisionTrace(id)),
		{ concurrency: "unbounded" }
	);
	return traces.filter(
		(trace): trace is NonNullable<typeof trace> => trace !== null
	);
});

const listDecisionTracesByGoal = Effect.fnUntraced(function* (
	profileId: string,
	goalId: string
) {
	const rows = yield* fromPromise("listDecisionTracesByGoal", () =>
		db
			.select()
			.from(decisionsTable)
			.where(eq(decisionsTable.goalId, goalId))
			.orderBy(desc(decisionsTable.createdAt))
	);
	return rows
		.filter((row) => row.profileId === profileId)
		.map((row) => ({
			id: row.id,
			profileId: row.profileId,
			goalId: row.goalId,
			kind: row.kind as Decision["kind"],
			trigger: row.trigger,
			stateFingerprint: row.stateFingerprint,
			route: row.route as Decision["route"],
			policyResult: {
				permitted: row.permitted === 1,
				route: row.route as PolicyResult["route"],
				reasons: parseJson(row.policyReasonsJson, []),
				policyVersion: row.policyVersion,
			},
			createdAt: row.createdAt,
		}));
});

export {
	getDecisionTrace,
	listDecisionTracesByGoal,
	listDecisionTracesByProfile,
	recordDecisionFeedback,
	recordDecisionTrace,
};
