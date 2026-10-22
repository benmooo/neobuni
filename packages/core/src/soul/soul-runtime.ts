import type {
	Drive,
	ResponseSpec,
	Signal,
	SignalSet,
	SoulConfig,
	Stance,
} from "@neobuni/contracts";
import { flattenSignalSet, hasMinimumConsumptionMode } from "../perception";
import {
	type DetectedEmotion,
	evaluateProtectiveDecision,
	type PreviousProtectiveState,
	type ProtectiveDecision,
	type ProtectiveLevel,
} from "./protective-evaluator";

type RecalledMemory = {
	content: string;
	type: string;
	keywords: string[];
};

type SoulSummary = {
	identity: string;
	relationship: string;
	drives: string;
	expression: string;
	boundaries: string;
};

type EmotionalLoad = "low" | "medium" | "high";
type Vulnerability = "low" | "medium" | "high";
type RelationalTemperature = "cold" | "neutral" | "warm";

type AppraisedContext = {
	userIntent: "support" | "reflection" | "planning" | "connection" | null;
	emotionalLoad: EmotionalLoad;
	vulnerability: Vulnerability;
	detectedEmotion: DetectedEmotion;
	needsComfort: boolean;
	needsReflection: boolean;
	readyForProgress: boolean;
	abnormalityCandidate: ProtectiveLevel;
	relationalTemperature: RelationalTemperature;
	recentNegativeTrend: number;
	repeatedAbnormalPattern: boolean;
};

type StanceDecision = {
	primary: Stance;
	secondary?: Stance;
	blocked: string[];
};

type SoulRuntimeState = {
	soulSummary: SoulSummary;
	appraisal: AppraisedContext;
	protectiveDecision: ProtectiveDecision;
	effectiveDriveOrder: Drive[];
	stanceDecision: StanceDecision;
	responsePlan: ResponseSpec;
};

type BuildSoulRuntimeStateInput = {
	soulConfig: SoulConfig;
	latestUserText: string;
	recentUserTexts: string[];
	recentAssistantTexts?: string[];
	signals: SignalSet;
	memories?: RecalledMemory[];
	previousProtectiveState?: PreviousProtectiveState;
};

const supportiveSignals = [
	"陪我",
	"抱抱",
	"别走",
	"在吗",
	"谢谢",
	"想你",
	"陪陪我",
	"stay with me",
	"thank you",
	"miss you",
	"be here",
];

const reflectiveSignals = [
	"为什么",
	"怎么办",
	"怎么做",
	"你觉得",
	"该不该",
	"why",
	"how",
	"should i",
	"what do you think",
	"help me think",
];

const planningSignals = [
	"计划",
	"步骤",
	"安排",
	"提醒",
	"待办",
	"执行",
	"查看",
	"查下",
	"查一下",
	"看下",
	"看一下",
	"生成",
	"发送",
	"日报",
	"周报",
	"月报",
	"报告",
	"完整内容",
	"plan",
	"steps",
	"schedule",
	"todo",
	"remind",
];

const warmSignals = [
	"谢谢",
	"抱抱",
	"想你",
	"晚安",
	"早安",
	"thank you",
	"good night",
	"good morning",
	"miss you",
];

const lowEmotionSignals = [
	"累",
	"烦",
	"难受",
	"失眠",
	"low",
	"sad",
	"tired",
	"upset",
];
const anxiousSignals = [
	"焦虑",
	"慌",
	"压得喘不过气",
	"anxious",
	"panic",
	"spiraling",
];
const overwhelmedSignals = [
	"崩溃",
	"撑不住",
	"受不了",
	"overwhelmed",
	"breaking down",
];
const collapsedSignals = [
	"绝望",
	"没意义",
	"想消失",
	"hopeless",
	"can't go on",
];

const normalizeText = (text: string) => text.trim().toLowerCase();

const includesAny = (text: string, patterns: string[]) =>
	patterns.some((pattern) => text.includes(pattern));

const maxSignalScore = (signals: Signal[], kinds: string[]) =>
	signals.reduce(
		(best, signal) =>
			kinds.includes(signal.kind) ? Math.max(best, signal.score) : best,
		0
	);

const getSignalByKind = (signals: Signal[], kind: string) =>
	signals.find((signal) => signal.kind === kind) ?? null;

const readBooleanMetadata = (signal: Signal | null, key: string) =>
	typeof signal?.metadata[key] === "boolean"
		? (signal.metadata[key] as boolean)
		: false;

const countMatches = (texts: string[], patterns: string[]) =>
	texts.reduce(
		(total, text) =>
			total +
			patterns.filter((pattern) => normalizeText(text).includes(pattern))
				.length,
		0
	);

const moveDriveToIndex = (
	drives: Drive[],
	drive: Drive,
	index: number
): Drive[] => {
	const filtered = drives.filter((item) => item !== drive);
	filtered.splice(index, 0, drive);
	return filtered;
};

const detectEmotion = (text: string): DetectedEmotion => {
	const normalized = normalizeText(text);

	if (includesAny(normalized, collapsedSignals)) {
		return "collapsed";
	}
	if (includesAny(normalized, overwhelmedSignals)) {
		return "overwhelmed";
	}
	if (includesAny(normalized, anxiousSignals)) {
		return "anxious";
	}
	if (includesAny(normalized, lowEmotionSignals)) {
		return "low";
	}
	return "neutral";
};

const appraiseContext = (input: {
	latestUserText: string;
	recentUserTexts: string[];
	signals: SignalSet;
	memories?: RecalledMemory[];
}): AppraisedContext => {
	const normalized = normalizeText(input.latestUserText);
	const consumableSignals = flattenSignalSet(input.signals).filter((signal) =>
		hasMinimumConsumptionMode(signal, "context_hint")
	);
	const detectedEmotion = detectEmotion(normalized);
	const supportiveScore = maxSignalScore(consumableSignals, [
		"support_request",
	]);
	const reflectiveScore = maxSignalScore(consumableSignals, [
		"reflection_request",
	]);
	const planningScore = maxSignalScore(consumableSignals, ["planning_request"]);
	const warmthScore = maxSignalScore(consumableSignals, ["warmth"]);
	const distressScore = maxSignalScore(consumableSignals, ["distress"]);
	const negativeTrendScore = maxSignalScore(consumableSignals, [
		"negative_trend",
	]);
	const withdrawalScore = maxSignalScore(consumableSignals, [
		"withdrawal_pattern",
	]);
	const schedulePressureScore = maxSignalScore(consumableSignals, [
		"time_pressure",
		"schedule_disruption",
		"missed_commitment",
	]);
	const scheduleCommitmentScore = maxSignalScore(consumableSignals, [
		"upcoming_commitment",
	]);
	const supportiveCount =
		countMatches([input.latestUserText], supportiveSignals) +
		(supportiveScore >= 0.45 ? 1 : 0);
	const reflectiveCount =
		countMatches([input.latestUserText], reflectiveSignals) +
		(reflectiveScore >= 0.45 ? 1 : 0);
	const planningCount =
		countMatches([input.latestUserText], planningSignals) +
		(planningScore >= 0.45 ? 1 : 0) +
		(schedulePressureScore >= 0.62 ? 1 : 0);
	const warmCount =
		countMatches([input.latestUserText], warmSignals) +
		Math.min(1, input.memories?.length ?? 0) +
		(warmthScore >= 0.42 ? 1 : 0);
	const recentEmotionHits = input.recentUserTexts.map((text) =>
		detectEmotion(text)
	);
	const negativeTurnCount = recentEmotionHits.filter(
		(emotion) => emotion !== "neutral"
	).length;
	const repeatedAbnormalPattern =
		negativeTurnCount >= 2 ||
		negativeTrendScore >= 0.62 ||
		withdrawalScore >= 0.62;
	const recentNegativeTrend =
		input.recentUserTexts.length === 0
			? 0
			: Math.max(
					negativeTurnCount / input.recentUserTexts.length,
					negativeTrendScore
				);

	const abnormalitySignalScore = Math.max(
		distressScore,
		negativeTrendScore,
		withdrawalScore
	);
	const abnormalityCandidateFromSignals =
		abnormalitySignalScore >= 0.78
			? 3
			: abnormalitySignalScore >= 0.58
				? 2
				: abnormalitySignalScore >= 0.42
					? 1
					: 0;

	const abnormalityCandidate: ProtectiveLevel =
		detectedEmotion === "collapsed"
			? 3
			: detectedEmotion === "overwhelmed"
				? 2
				: detectedEmotion === "anxious" || detectedEmotion === "low"
					? 1
					: abnormalityCandidateFromSignals;

	const supportIntentScore = Math.max(
		supportiveScore,
		distressScore * 0.95,
		negativeTrendScore * 0.78,
		withdrawalScore * 0.82,
		supportiveCount * 0.24
	);
	const reflectionIntentScore = Math.max(
		reflectiveScore,
		reflectiveCount * 0.24
	);
	const planningIntentScore = Math.max(
		planningScore,
		schedulePressureScore * 0.82,
		scheduleCommitmentScore * 0.64,
		Math.min(1, planningCount * 0.24)
	);
	const connectionIntentScore = Math.max(warmthScore, warmCount * 0.22);

	const emotionalLoad: EmotionalLoad =
		abnormalityCandidate >= 2
			? "high"
			: abnormalityCandidate === 1 ||
					distressScore >= 0.42 ||
					negativeTrendScore >= 0.42
				? "medium"
				: "low";
	const vulnerability: Vulnerability =
		detectedEmotion === "collapsed" ||
		detectedEmotion === "overwhelmed" ||
		withdrawalScore >= 0.68
			? "high"
			: emotionalLoad === "medium" ||
					supportiveCount > 0 ||
					supportIntentScore >= 0.5
				? "medium"
				: "low";
	const userIntent =
		supportIntentScore >= 0.62
			? "support"
			: planningIntentScore >= 0.62
				? "planning"
				: reflectionIntentScore >= 0.58
					? "reflection"
					: connectionIntentScore >= 0.48
						? "connection"
						: null;

	return {
		userIntent,
		emotionalLoad,
		vulnerability,
		detectedEmotion,
		needsComfort:
			emotionalLoad !== "low" ||
			supportIntentScore >= 0.52 ||
			distressScore >= 0.5,
		needsReflection: reflectionIntentScore >= 0.55,
		readyForProgress:
			planningIntentScore >= 0.6 &&
			vulnerability !== "high" &&
			emotionalLoad !== "high" &&
			withdrawalScore < 0.55,
		abnormalityCandidate,
		relationalTemperature:
			withdrawalScore >= 0.62
				? "cold"
				: warmCount > 0 || warmthScore >= 0.48
					? "warm"
					: "neutral",
		recentNegativeTrend,
		repeatedAbnormalPattern,
	};
};

const buildExternalSignalScores = (signals: SignalSet) => {
	const consumableSignals = flattenSignalSet(signals).filter((signal) =>
		hasMinimumConsumptionMode(signal, "context_hint")
	);
	const timeContextSignal = getSignalByKind(consumableSignals, "time_context");
	const quietHours = readBooleanMetadata(timeContextSignal, "quietHours");
	const offHours = readBooleanMetadata(timeContextSignal, "offHours");

	return {
		behaviorAnomalyScore: maxSignalScore(consumableSignals, [
			"negative_trend",
			"withdrawal_pattern",
			"initiative_drop",
		]),
		scheduleDisruptionScore: maxSignalScore(consumableSignals, [
			"schedule_disruption",
			"missed_commitment",
			"time_pressure",
		]),
		environmentRiskScore:
			quietHours && timeContextSignal
				? timeContextSignal.score * 0.82
				: offHours && timeContextSignal
					? timeContextSignal.score * 0.58
					: 0,
	};
};

const describeAddressing = (soulConfig: SoulConfig) =>
	soulConfig.expression.addressing.mode === "preferred_name" &&
	soulConfig.expression.addressing.preferredName.length > 0
		? `Address the user as "${soulConfig.expression.addressing.preferredName}" when it feels natural.`
		: "Address the user with their configured name unless the moment clearly calls for less repetition.";

const buildSoulSummary = (soulConfig: SoulConfig): SoulSummary => ({
	identity: `${soulConfig.name} is a ${soulConfig.relationship.role} with a ${soulConfig.relationship.relationshipFlavor} relational flavor.`,
	relationship: `Default stance stays attentive with ${soulConfig.relationship.closenessLevel} closeness and ${soulConfig.relationship.initiativeLevel} initiative. Guard can rise when abnormal signals appear.`,
	drives: `Drive priority is ${soulConfig.drives.priorityOrder.join(" > ")}.`,
	expression: `Expression stays ${soulConfig.expression.tone}, ${soulConfig.expression.pacing}, with ${soulConfig.expression.verbosity} verbosity. Default intimacy is ${soulConfig.expression.intimacy.default}. ${describeAddressing(soulConfig)}`,
	boundaries: `Never cross boundary, manipulate intimacy, or pressure connection. Keep intimacy at ${soulConfig.expression.intimacy.maxWithoutUserSignal} or below without user pull.`,
});

const reorderDrives = (
	soulConfig: SoulConfig,
	protectiveDecision: ProtectiveDecision,
	appraisal: AppraisedContext
): Drive[] => {
	const baseDriveOrder = soulConfig.drives.priorityOrder as Drive[];

	if (protectiveDecision.level >= 2) {
		return [
			"protection",
			"respect",
			"comfort",
			"continuity",
			"progress",
			"connection",
		];
	}

	if (protectiveDecision.level === 1) {
		return [
			"respect",
			"comfort",
			"protection",
			"continuity",
			"progress",
			"connection",
		];
	}

	if (appraisal.readyForProgress) {
		return moveDriveToIndex(baseDriveOrder, "progress", 3);
	}

	return [...baseDriveOrder];
};

const selectStance = (
	appraisal: AppraisedContext,
	protectiveDecision: ProtectiveDecision
): StanceDecision => {
	if (protectiveDecision.level >= 2) {
		return {
			primary: "protective",
			secondary: "comforting",
			blocked: ["playful_when_fragile", "mobilizing_when_unstable"],
		};
	}

	if (appraisal.needsComfort) {
		return {
			primary: protectiveDecision.level >= 1 ? "protective" : "comforting",
			secondary: "companion",
			blocked:
				appraisal.vulnerability === "high" ? ["playful_when_fragile"] : [],
		};
	}

	if (appraisal.needsReflection) {
		return {
			primary: "reflective",
			secondary: "companion",
			blocked: [],
		};
	}

	if (appraisal.readyForProgress) {
		return {
			primary: "mobilizing",
			secondary: "companion",
			blocked: [],
		};
	}

	if (
		appraisal.relationalTemperature === "warm" &&
		appraisal.emotionalLoad === "low"
	) {
		return {
			primary: "playful",
			secondary: "companion",
			blocked: [],
		};
	}

	return {
		primary: "companion",
		blocked: [],
	};
};

const buildResponsePlan = (input: {
	soulConfig: SoulConfig;
	appraisal: AppraisedContext;
	protectiveDecision: ProtectiveDecision;
	stanceDecision: StanceDecision;
}): ResponseSpec => {
	const goal: ResponseSpec["goal"] =
		input.stanceDecision.primary === "protective"
			? "guard"
			: input.stanceDecision.primary === "comforting"
				? "soothe"
				: input.stanceDecision.primary === "reflective"
					? "clarify"
					: input.stanceDecision.primary === "mobilizing"
						? "gently_mobilize"
						: "stay_present";

	const tone = [
		input.soulConfig.expression.tone,
		input.soulConfig.expression.pacing,
		input.appraisal.emotionalLoad === "high"
			? "short_grounded"
			: "natural_flow",
		input.protectiveDecision.level >= 1 ? "extra_attentive" : "light_touch",
	];

	const mustAvoid = [
		"manipulation",
		"pressure_for_connection",
		"performative_intimacy",
		"melodrama",
		"patronizing_teacher_tone",
		...(input.protectiveDecision.level >= 2
			? ["playful_deflection", "hard_push"]
			: []),
	];

	const toolPolicy: ResponseSpec["toolPolicy"] =
		input.appraisal.userIntent === "planning"
			? input.appraisal.readyForProgress
				? "prefer"
				: "allow"
			: input.protectiveDecision.level >= 2 ||
					input.appraisal.emotionalLoad === "high"
				? "avoid"
				: input.appraisal.readyForProgress
					? "prefer"
					: "allow";

	return {
		goal,
		stance: input.stanceDecision.primary,
		tone,
		mustAvoid,
		intimacyCap: input.soulConfig.expression.intimacy.maxWithoutUserSignal,
		verbosity: input.soulConfig.expression.verbosity,
		shouldAskFollowup:
			input.appraisal.needsComfort ||
			input.appraisal.needsReflection ||
			input.protectiveDecision.level >= 1,
		shouldSuggestAction:
			input.appraisal.readyForProgress || input.protectiveDecision.level >= 2,
		toolPolicy,
	};
};

const buildSoulRuntimeState = (
	input: BuildSoulRuntimeStateInput
): SoulRuntimeState => {
	const appraisal = appraiseContext({
		latestUserText: input.latestUserText,
		recentUserTexts: input.recentUserTexts,
		signals: input.signals,
		memories: input.memories,
	});
	const externalSignals = buildExternalSignalScores(input.signals);

	const protectiveDecision = evaluateProtectiveDecision({
		currentTurn: {
			text: input.latestUserText,
			detectedEmotion: appraisal.detectedEmotion,
			emotionConfidence: appraisal.emotionalLoad === "high" ? 0.9 : 0.65,
		},
		recentContext: {
			recentUserTurns: input.recentUserTexts,
			recentAssistantTurns: input.recentAssistantTexts ?? [],
			recentNegativeTrend: appraisal.recentNegativeTrend,
			repeatedAbnormalPattern: appraisal.repeatedAbnormalPattern,
		},
		externalSignals,
		previousState: input.previousProtectiveState,
		canGuardWhenAbnormal: input.soulConfig.relationship.canGuardWhenAbnormal,
	});

	const effectiveDriveOrder = reorderDrives(
		input.soulConfig,
		protectiveDecision,
		appraisal
	);
	const stanceDecision = selectStance(appraisal, protectiveDecision);
	const responsePlan = buildResponsePlan({
		soulConfig: input.soulConfig,
		appraisal,
		protectiveDecision,
		stanceDecision,
	});

	return {
		soulSummary: buildSoulSummary(input.soulConfig),
		appraisal,
		protectiveDecision,
		effectiveDriveOrder,
		stanceDecision,
		responsePlan,
	};
};

const buildSoulRuntimePrompt = (runtime: SoulRuntimeState) =>
	[
		"SOUL runtime:",
		`- Identity: ${runtime.soulSummary.identity}`,
		`- Relationship: ${runtime.soulSummary.relationship}`,
		`- Drives: ${runtime.soulSummary.drives}`,
		`- Expression: ${runtime.soulSummary.expression}`,
		`- Boundaries: ${runtime.soulSummary.boundaries}`,
		`- Appraisal: intent=${runtime.appraisal.userIntent ?? "unknown"}, emotional_load=${runtime.appraisal.emotionalLoad}, vulnerability=${runtime.appraisal.vulnerability}, abnormality=${runtime.appraisal.abnormalityCandidate}, temperature=${runtime.appraisal.relationalTemperature}`,
		`- Protective decision: level=${runtime.protectiveDecision.level}, stance=${runtime.protectiveDecision.activateProtectiveStance ? "active" : "inactive"}, initiative=${runtime.protectiveDecision.allowElevatedInitiative ? "elevated" : "normal"}, reasons=${runtime.protectiveDecision.reasons.join(", ") || "none"}`,
		`- Effective drives now: ${runtime.effectiveDriveOrder.join(" > ")}`,
		`- Current stance: primary=${runtime.stanceDecision.primary}${runtime.stanceDecision.secondary ? `, secondary=${runtime.stanceDecision.secondary}` : ""}`,
	].join("\n");

export {
	type AppraisedContext,
	appraiseContext,
	type BuildSoulRuntimeStateInput,
	buildResponsePlan,
	buildSoulRuntimePrompt,
	buildSoulRuntimeState,
	buildSoulSummary,
	type RecalledMemory,
	reorderDrives,
	type SoulRuntimeState,
	type SoulSummary,
	type StanceDecision,
	selectStance,
};
