type Clock = () => string;
type IdGenerator = () => string;

interface ConversationInput {
  hidden?: boolean;
  modelKey: string;
  profileId: string;
  title: string;
}

interface MessageInput {
  content: string;
  conversationId: string;
  kind: "text" | "generated" | "event" | "tool_result";
  metadata: Record<string, unknown>;
  role: "system" | "user" | "assistant" | "tool";
  turnId?: string | null;
}

interface ScheduleInput {
  blueprint?: Record<string, unknown> | null;
  content: string;
  cronExpr: string | null;
  deliveredAt?: string | null;
  lastMaterializedAt?: string | null;
  lastTriggeredAt?: string | null;
  metadata: Record<string, unknown>;
  profileId: string;
  timezone: string;
  title: string;
  triggerAt: string | null;
  type: "reminder" | "alarm" | "monitor";
}

interface TaskRunInput {
  inputSnapshot?: Record<string, unknown> | null;
  maxAttempts?: number;
  profileId: string;
  promptSnapshot: string;
  scheduledFor: string;
  scheduleId: string;
  toolPolicySnapshot?: Record<string, unknown> | null;
}

interface EventInput {
  payload: Record<string, unknown>;
  profileId: string;
  type: string;
}

interface RuntimeTurnInput {
  conversationId?: string | null;
  executionSource?: "chat" | "task_run";
  modelKey: string;
  profileId: string;
  providerKey: string;
  taskRunId?: string | null;
}

interface RuntimeSpanInput {
  conversationId?: string | null;
  input?: Record<string, unknown> | null;
  seq: number;
  stage: string;
  turnId: string;
}

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

interface MemoryInput {
  content: string;
  conversationId?: string | null;
  episodeId?: string | null;
  importance: number;
  keywords: string[];
  memoryClass?: "episodic" | "semantic" | "task";
  profileId: string;
  sourceEndTs: string | null;
  sourceKind?:
    | "digest"
    | "manual"
    | "chat_tool"
    | "conflict_resolution"
    | "imported"
    | "learned";
  sourceStartTs: string | null;
  status?: "active" | "done" | "superseded" | "archived";
  type: "event" | "thought" | "preference" | "fact" | "task";
  unresolved: boolean;
}

interface MemoryConflictInput {
  conflictKind: "semantic_overlap" | "task_overlap";
  conversationId?: string | null;
  existingMemoryId: string;
  operation: "save" | "update";
  profileId: string;
  proposalJson: string;
  reason: string;
  subjectMemoryId?: string | null;
  turnId?: string | null;
}

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
