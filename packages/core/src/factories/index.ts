type Clock = () => string;
type IdGenerator = () => string;

type ConversationInput = {
	profileId: string;
	title: string;
	modelKey: string;
	hidden?: boolean;
};

type MessageInput = {
	conversationId: string;
	turnId?: string | null;
	role: "system" | "user" | "assistant" | "tool";
	kind: "text" | "generated" | "event" | "tool_result";
	content: string;
	metadata: Record<string, unknown>;
};

type ScheduleInput = {
	profileId: string;
	type: "reminder" | "alarm" | "monitor";
	title: string;
	content: string;
	triggerAt: string | null;
	cronExpr: string | null;
	timezone: string;
	metadata: Record<string, unknown>;
	blueprint?: Record<string, unknown> | null;
	lastTriggeredAt?: string | null;
	deliveredAt?: string | null;
	lastMaterializedAt?: string | null;
};

type TaskRunInput = {
	profileId: string;
	scheduleId: string;
	scheduledFor: string;
	promptSnapshot: string;
	toolPolicySnapshot?: Record<string, unknown> | null;
	inputSnapshot?: Record<string, unknown> | null;
	maxAttempts?: number;
};

type EventInput = {
	profileId: string;
	type: string;
	payload: Record<string, unknown>;
};

type RuntimeTurnInput = {
	profileId: string;
	conversationId?: string | null;
	providerKey: string;
	modelKey: string;
	executionSource?: "chat" | "task_run";
	taskRunId?: string | null;
};

type RuntimeSpanInput = {
	turnId: string;
	conversationId?: string | null;
	stage: string;
	seq: number;
	input?: Record<string, unknown> | null;
};

const defaultClock: Clock = () => new Date().toISOString();
const defaultId: IdGenerator = () => crypto.randomUUID();

const makeConversation =
	(clock: Clock = defaultClock, createId: IdGenerator = defaultId) =>
	(input: ConversationInput) => {
		const now = clock();
		return {
			id: createId(),
			profileId: input.profileId,
			title: input.title,
			modelKey: input.modelKey,
			hidden: input.hidden ?? false,
			status: "active" as const,
			createdAt: now,
			updatedAt: now,
		};
	};

const makeMessage =
	(clock: Clock = defaultClock, createId: IdGenerator = defaultId) =>
	(input: MessageInput) => ({
		id: createId(),
		conversationId: input.conversationId,
		turnId: input.turnId ?? null,
		role: input.role,
		kind: input.kind,
		content: input.content,
		metadataJson: JSON.stringify(input.metadata),
		createdAt: clock(),
	});

const makeSchedule =
	(clock: Clock = defaultClock, createId: IdGenerator = defaultId) =>
	(input: ScheduleInput) => {
		const now = clock();
		return {
			id: createId(),
			profileId: input.profileId,
			type: input.type,
			title: input.title,
			content: input.content,
			triggerAt: input.triggerAt,
			cronExpr: input.cronExpr,
			timezone: input.timezone,
			status: "active" as const,
			lastTriggeredAt: input.lastTriggeredAt ?? null,
			deliveredAt: input.deliveredAt ?? null,
			lastMaterializedAt: input.lastMaterializedAt ?? null,
			metadataJson: JSON.stringify(input.metadata),
			blueprintJson: JSON.stringify(input.blueprint ?? null),
			createdAt: now,
			updatedAt: now,
		};
	};

const makeTaskRun =
	(clock: Clock = defaultClock, createId: IdGenerator = defaultId) =>
	(input: TaskRunInput) => {
		const now = clock();
		return {
			id: createId(),
			profileId: input.profileId,
			scheduleId: input.scheduleId,
			status: "queued" as const,
			scheduledFor: input.scheduledFor,
			promptSnapshot: input.promptSnapshot,
			toolPolicySnapshotJson: JSON.stringify(input.toolPolicySnapshot ?? null),
			inputSnapshotJson: JSON.stringify(input.inputSnapshot ?? null),
			attempt: 0,
			maxAttempts: input.maxAttempts ?? 3,
			leaseOwner: null,
			leaseExpiresAt: null,
			heartbeatAt: null,
			nextRetryAt: null,
			runtimeTurnId: null,
			resultJson: null,
			errorJson: null,
			createdAt: now,
			startedAt: null,
			finishedAt: null,
			updatedAt: now,
		};
	};

type MemoryInput = {
	profileId: string;
	conversationId?: string | null;
	episodeId?: string | null;
	content: string;
	type: "event" | "thought" | "preference" | "fact" | "task";
	keywords: string[];
	importance: number;
	sourceStartTs: string | null;
	sourceEndTs: string | null;
	unresolved: boolean;
	memoryClass?: "episodic" | "semantic" | "task";
	status?: "active" | "done" | "superseded" | "archived";
	sourceKind?:
		| "digest"
		| "manual"
		| "chat_tool"
		| "conflict_resolution"
		| "imported"
		| "learned";
};

type MemoryConflictInput = {
	profileId: string;
	conversationId?: string | null;
	turnId?: string | null;
	operation: "save" | "update";
	conflictKind: "semantic_overlap" | "task_overlap";
	reason: string;
	existingMemoryId: string;
	subjectMemoryId?: string | null;
	proposalJson: string;
};

const makeEvent =
	(clock: Clock = defaultClock, createId: IdGenerator = defaultId) =>
	(input: EventInput) => ({
		id: createId(),
		profileId: input.profileId,
		type: input.type,
		payloadJson: JSON.stringify(input.payload),
		createdAt: clock(),
	});

const makeMemory =
	(clock: Clock = defaultClock, createId: IdGenerator = defaultId) =>
	(input: MemoryInput) => {
		const now = clock();
		return {
			id: createId(),
			profileId: input.profileId,
			conversationId: input.conversationId ?? null,
			episodeId: input.episodeId ?? null,
			content: input.content,
			type: input.type,
			memoryClass: input.memoryClass ?? "episodic",
			status: input.status ?? "active",
			keywordsJson: JSON.stringify(input.keywords),
			importance: input.importance,
			embeddingVersion: null,
			sourceKind: input.sourceKind ?? "digest",
			sourceStartTs: input.sourceStartTs,
			sourceEndTs: input.sourceEndTs,
			unresolved: input.unresolved ? 1 : 0,
			createdAt: now,
			updatedAt: now,
		};
	};

const makeMemoryConflict =
	(clock: Clock = defaultClock, createId: IdGenerator = defaultId) =>
	(input: MemoryConflictInput) => {
		const now = clock();
		return {
			id: createId(),
			profileId: input.profileId,
			conversationId: input.conversationId ?? null,
			turnId: input.turnId ?? null,
			operation: input.operation,
			conflictKind: input.conflictKind,
			status: "open" as const,
			reason: input.reason,
			existingMemoryId: input.existingMemoryId,
			subjectMemoryId: input.subjectMemoryId ?? null,
			proposalJson: input.proposalJson,
			resolutionJson: null,
			resolvedAt: null,
			createdAt: now,
			updatedAt: now,
		};
	};

const makeRuntimeTurn =
	(clock: Clock = defaultClock, createId: IdGenerator = defaultId) =>
	(input: RuntimeTurnInput) => {
		const now = clock();
		return {
			id: createId(),
			profileId: input.profileId,
			conversationId: input.conversationId ?? null,
			executionSource: input.executionSource ?? "chat",
			taskRunId: input.taskRunId ?? null,
			requestMessageId: null,
			responseMessageId: null,
			status: "running" as const,
			startedAt: now,
			endedAt: null,
			durationMs: null,
			providerKey: input.providerKey,
			modelKey: input.modelKey,
			protectiveLevel: null,
			primaryStance: null,
			memoryCount: 0,
			memoryRecallStrategy: null,
			preRecallCount: 0,
			toolCallCount: 0,
			hadToolFailures: 0,
			hadToolRecall: 0,
			errorCode: null,
			errorJson: null,
			createdAt: now,
			updatedAt: now,
		};
	};

const makeRuntimeSpan =
	(clock: Clock = defaultClock, createId: IdGenerator = defaultId) =>
	(input: RuntimeSpanInput) => ({
		id: createId(),
		turnId: input.turnId,
		conversationId: input.conversationId ?? null,
		stage: input.stage,
		seq: input.seq,
		status: "running" as const,
		startedAt: clock(),
		endedAt: null,
		durationMs: null,
		inputJson: input.input ? JSON.stringify(input.input) : null,
		outputJson: null,
		errorJson: null,
	});

export {
	makeConversation,
	makeEvent,
	makeMemory,
	makeMemoryConflict,
	makeMessage,
	makeRuntimeSpan,
	makeRuntimeTurn,
	makeSchedule,
	makeTaskRun,
};
