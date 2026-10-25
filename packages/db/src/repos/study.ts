import {
  type StudyCheck,
  type StudyGoalConfig,
  type StudyLessonEnrichment,
  type StudyMastery,
  type StudyPlan,
  type StudyPlanNode,
  type StudySession,
  studyGoalConfigSchema,
} from "@neobuni/contracts";
import { and, asc, desc, eq } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import {
  goalsTable,
  studyChecksTable,
  studyGoalConfigsTable,
  studyMasteryTable,
  studyPlanNodesTable,
  studyPlansTable,
  studySessionsTable,
} from "../schema";

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseConfig = (value: string): StudyGoalConfig =>
  studyGoalConfigSchema.parse(JSON.parse(value));

const toStudyPlan = (row: typeof studyPlansTable.$inferSelect): StudyPlan => ({
  id: row.id,
  profileId: row.profileId,
  goalId: row.goalId,
  version: row.version,
  status: row.status as StudyPlan["status"],
  templateId: row.templateId,
  diagnostics: parseJson(row.diagnosticsJson, []),
  createdAt: row.createdAt,
  activatedAt: row.activatedAt,
});

const toStudyPlanNode = (
  row: typeof studyPlanNodesTable.$inferSelect
): StudyPlanNode => ({
  id: row.id,
  planId: row.planId,
  parentId: row.parentId,
  kind: row.kind as StudyPlanNode["kind"],
  order: row.order,
  title: row.title,
  objective: row.objective,
  whatText: row.whatText,
  howText: row.howText,
  resources: parseJson(row.resourcesJson, []),
  estimatedMinutes: row.estimatedMinutes,
  weight: row.weight,
  paper: row.paper as StudyPlanNode["paper"],
  syllabusRefs: parseJson(row.syllabusRefsJson, []),
  prerequisites: parseJson(row.prerequisitesJson, []),
  checkSpecs: parseJson(row.checkSpecsJson, []),
  enrichment: row.enrichmentJson
    ? parseJson<StudyLessonEnrichment | null>(row.enrichmentJson, null)
    : null,
});

const toStudySession = (
  row: typeof studySessionsTable.$inferSelect
): StudySession => ({
  id: row.id,
  profileId: row.profileId,
  goalId: row.goalId,
  planNodeId: row.planNodeId,
  scheduledFor: row.scheduledFor,
  timezone: row.timezone,
  durationMinutes: row.durationMinutes,
  status: row.status as StudySession["status"],
  startedAt: row.startedAt,
  completedAt: row.completedAt,
  actualMinutes: row.actualMinutes,
  rescheduledFrom: row.rescheduledFrom,
  notes: row.notes,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toStudyCheck = (
  row: typeof studyChecksTable.$inferSelect
): StudyCheck => ({
  id: row.id,
  profileId: row.profileId,
  goalId: row.goalId,
  sessionId: row.sessionId,
  planNodeId: row.planNodeId,
  kind: row.kind as StudyCheck["kind"],
  prompt: row.prompt,
  answer: row.answer,
  rubric: row.rubric,
  score: row.score,
  maxScore: row.maxScore,
  passed: row.passed === null ? null : row.passed === 1,
  gradedBy: row.gradedBy as StudyCheck["gradedBy"],
  feedback: row.feedback,
  createdAt: row.createdAt,
});

const toStudyMastery = (
  row: typeof studyMasteryTable.$inferSelect
): StudyMastery => ({
  goalId: row.goalId,
  planNodeId: row.planNodeId,
  score: row.score,
  confidence: row.confidence,
  attempts: row.attempts,
  lastScore: row.lastScore,
  lastAssessedAt: row.lastAssessedAt,
  nextReviewAt: row.nextReviewAt,
  updatedAt: row.updatedAt,
});

const upsertStudyGoalConfig = Effect.fnUntraced(function* (input: {
  goalId: string;
  profileId: string;
  config: StudyGoalConfig;
}) {
  const now = new Date().toISOString();
  const configJson = JSON.stringify(input.config);
  yield* fromPromise("upsertStudyGoalConfig", () =>
    db
      .insert(studyGoalConfigsTable)
      .values({
        goalId: input.goalId,
        profileId: input.profileId,
        targetAt: input.config.targetAt,
        dailyMinutes: input.config.dailyMinutes,
        timezone: input.config.timezone,
        configJson,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: studyGoalConfigsTable.goalId,
        set: {
          targetAt: input.config.targetAt,
          dailyMinutes: input.config.dailyMinutes,
          timezone: input.config.timezone,
          configJson,
          updatedAt: now,
        },
      })
  );
  return input.config;
});

const getStudyGoalConfig = Effect.fnUntraced(function* (goalId: string) {
  const row = yield* fromPromise("getStudyGoalConfig", () =>
    db
      .select()
      .from(studyGoalConfigsTable)
      .where(eq(studyGoalConfigsTable.goalId, goalId))
      .limit(1)
      .then((rows) => rows[0] ?? null)
  );
  return row ? parseConfig(row.configJson) : null;
});

const createStudyPlan = Effect.fnUntraced(function* (input: {
  plan: Omit<StudyPlan, "createdAt" | "activatedAt"> & {
    createdAt?: string;
    activatedAt?: string | null;
  };
  nodes: StudyPlanNode[];
}) {
  const createdAt = input.plan.createdAt ?? new Date().toISOString();
  const record = {
    id: input.plan.id,
    profileId: input.plan.profileId,
    goalId: input.plan.goalId,
    version: input.plan.version,
    status: input.plan.status,
    templateId: input.plan.templateId,
    diagnosticsJson: JSON.stringify(input.plan.diagnostics),
    createdAt,
    activatedAt: input.plan.activatedAt ?? null,
  };

  yield* fromPromise("createStudyPlan", () =>
    db.insert(studyPlansTable).values(record)
  );

  if (input.nodes.length > 0) {
    yield* fromPromise("createStudyPlan", () =>
      db.insert(studyPlanNodesTable).values(
        input.nodes.map((node) => ({
          id: node.id,
          planId: node.planId,
          parentId: node.parentId,
          kind: node.kind,
          order: node.order,
          title: node.title,
          objective: node.objective,
          whatText: node.whatText,
          howText: node.howText,
          resourcesJson: JSON.stringify(node.resources),
          estimatedMinutes: node.estimatedMinutes,
          weight: node.weight,
          paper: node.paper,
          syllabusRefsJson: JSON.stringify(node.syllabusRefs),
          prerequisitesJson: JSON.stringify(node.prerequisites),
          checkSpecsJson: JSON.stringify(node.checkSpecs),
          createdAt,
        }))
      )
    );
  }

  return {
    plan: toStudyPlan(record),
    nodes: input.nodes,
  };
});

const getStudyPlan = Effect.fnUntraced(function* (planId: string) {
  const row = yield* fromPromise("getStudyPlan", () =>
    db
      .select()
      .from(studyPlansTable)
      .where(eq(studyPlansTable.id, planId))
      .limit(1)
      .then((rows) => rows[0] ?? null)
  );
  if (!row) {
    return null;
  }
  const nodes = yield* fromPromise("getStudyPlan", () =>
    db
      .select()
      .from(studyPlanNodesTable)
      .where(eq(studyPlanNodesTable.planId, planId))
      .orderBy(asc(studyPlanNodesTable.order))
  );
  return { plan: toStudyPlan(row), nodes: nodes.map(toStudyPlanNode) };
});

const getLatestStudyPlan = Effect.fnUntraced(function* (input: {
  goalId: string;
  status?: StudyPlan["status"];
}) {
  const row = yield* fromPromise("getLatestStudyPlan", () =>
    db
      .select()
      .from(studyPlansTable)
      .where(
        and(
          eq(studyPlansTable.goalId, input.goalId),
          ...(input.status ? [eq(studyPlansTable.status, input.status)] : [])
        )
      )
      .orderBy(desc(studyPlansTable.version))
      .limit(1)
      .then((rows) => rows[0] ?? null)
  );
  if (!row) {
    return null;
  }
  return yield* getStudyPlan(row.id);
});

const activateStudyPlan = Effect.fnUntraced(function* (input: {
  goalId: string;
  planId: string;
}) {
  const plan = yield* fromPromise("activateStudyPlan", () =>
    db
      .select()
      .from(studyPlansTable)
      .where(eq(studyPlansTable.id, input.planId))
      .limit(1)
      .then((rows) => rows[0] ?? null)
  );
  if (!plan || plan.goalId !== input.goalId) {
    return null;
  }
  const now = new Date().toISOString();
  yield* fromPromise("activateStudyPlan", async () => {
    await db
      .update(studyPlansTable)
      .set({ status: "superseded" })
      .where(
        and(
          eq(studyPlansTable.goalId, input.goalId),
          eq(studyPlansTable.status, "active")
        )
      );
    await db
      .update(studyPlansTable)
      .set({ status: "active", activatedAt: now })
      .where(eq(studyPlansTable.id, input.planId));
    await db
      .update(goalsTable)
      .set({ planVersion: plan.version, updatedAt: now })
      .where(eq(goalsTable.id, input.goalId));
  });
  return yield* getStudyPlan(input.planId);
});

const updateStudyNodeEnrichment = Effect.fnUntraced(function* (input: {
  enrichment: StudyLessonEnrichment;
  planNodeId: string;
}) {
  const row = yield* fromPromise("updateStudyNodeEnrichment", () =>
    db
      .select()
      .from(studyPlanNodesTable)
      .where(eq(studyPlanNodesTable.id, input.planNodeId))
      .limit(1)
      .then((rows) => rows[0] ?? null)
  );
  if (!row) {
    return null;
  }
  const enrichmentJson = JSON.stringify(input.enrichment);
  yield* fromPromise("updateStudyNodeEnrichment", () =>
    db
      .update(studyPlanNodesTable)
      .set({ enrichmentJson })
      .where(eq(studyPlanNodesTable.id, input.planNodeId))
  );
  return toStudyPlanNode({ ...row, enrichmentJson });
});

const createStudySessions = Effect.fnUntraced(function* (
  inputs: Array<
    Omit<StudySession, "id" | "createdAt" | "updatedAt"> & { id?: string }
  >
) {
  if (inputs.length === 0) {
    return [];
  }
  const now = new Date().toISOString();
  const records = inputs.map((input) => ({
    id: input.id ?? crypto.randomUUID(),
    profileId: input.profileId,
    goalId: input.goalId,
    planNodeId: input.planNodeId,
    scheduledFor: input.scheduledFor,
    timezone: input.timezone,
    durationMinutes: input.durationMinutes,
    status: input.status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    actualMinutes: input.actualMinutes,
    rescheduledFrom: input.rescheduledFrom,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  }));
  yield* fromPromise("createStudySessions", () =>
    db.insert(studySessionsTable).values(records)
  );
  return records.map(toStudySession);
});

const getStudySession = Effect.fnUntraced(function* (sessionId: string) {
  const row = yield* fromPromise("getStudySession", () =>
    db
      .select()
      .from(studySessionsTable)
      .where(eq(studySessionsTable.id, sessionId))
      .limit(1)
      .then((rows) => rows[0] ?? null)
  );
  return row ? toStudySession(row) : null;
});

const listStudySessions = Effect.fnUntraced(function* (goalId: string) {
  const rows = yield* fromPromise("listStudySessions", () =>
    db
      .select()
      .from(studySessionsTable)
      .where(eq(studySessionsTable.goalId, goalId))
      .orderBy(asc(studySessionsTable.scheduledFor))
  );
  return rows.map(toStudySession);
});

const updateStudySession = Effect.fnUntraced(function* (input: {
  sessionId: string;
  patch: Partial<
    Pick<
      StudySession,
      | "status"
      | "startedAt"
      | "completedAt"
      | "actualMinutes"
      | "rescheduledFrom"
      | "notes"
      | "scheduledFor"
    >
  >;
}) {
  const current = yield* fromPromise("updateStudySession", () =>
    db
      .select()
      .from(studySessionsTable)
      .where(eq(studySessionsTable.id, input.sessionId))
      .limit(1)
      .then((rows) => rows[0] ?? null)
  );
  if (!current) {
    return null;
  }
  const updatedAt = new Date().toISOString();
  const next = {
    status: input.patch.status ?? current.status,
    startedAt:
      input.patch.startedAt === undefined
        ? current.startedAt
        : input.patch.startedAt,
    completedAt:
      input.patch.completedAt === undefined
        ? current.completedAt
        : input.patch.completedAt,
    actualMinutes:
      input.patch.actualMinutes === undefined
        ? current.actualMinutes
        : input.patch.actualMinutes,
    rescheduledFrom:
      input.patch.rescheduledFrom === undefined
        ? current.rescheduledFrom
        : input.patch.rescheduledFrom,
    notes: input.patch.notes === undefined ? current.notes : input.patch.notes,
    scheduledFor: input.patch.scheduledFor ?? current.scheduledFor,
    updatedAt,
  };
  yield* fromPromise("updateStudySession", () =>
    db
      .update(studySessionsTable)
      .set(next)
      .where(eq(studySessionsTable.id, input.sessionId))
  );
  return toStudySession({ ...current, ...next });
});

const createStudyCheck = Effect.fnUntraced(function* (
  input: Omit<StudyCheck, "id" | "createdAt"> & { id?: string }
) {
  const record = {
    id: input.id ?? crypto.randomUUID(),
    profileId: input.profileId,
    goalId: input.goalId,
    sessionId: input.sessionId,
    planNodeId: input.planNodeId,
    kind: input.kind,
    prompt: input.prompt,
    answer: input.answer,
    rubric: input.rubric,
    score: input.score,
    maxScore: input.maxScore,
    passed: input.passed === null ? null : input.passed ? 1 : 0,
    gradedBy: input.gradedBy,
    feedback: input.feedback,
    createdAt: new Date().toISOString(),
  };
  yield* fromPromise("createStudyCheck", () =>
    db.insert(studyChecksTable).values(record)
  );
  return toStudyCheck(record);
});

const listStudyChecks = Effect.fnUntraced(function* (goalId: string) {
  const rows = yield* fromPromise("listStudyChecks", () =>
    db
      .select()
      .from(studyChecksTable)
      .where(eq(studyChecksTable.goalId, goalId))
      .orderBy(asc(studyChecksTable.createdAt))
  );
  return rows.map(toStudyCheck);
});

const upsertStudyMastery = Effect.fnUntraced(function* (
  input: Omit<StudyMastery, "updatedAt">
) {
  const updatedAt = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    goalId: input.goalId,
    planNodeId: input.planNodeId,
    score: input.score,
    confidence: input.confidence,
    attempts: input.attempts,
    lastScore: input.lastScore,
    lastAssessedAt: input.lastAssessedAt,
    nextReviewAt: input.nextReviewAt,
    updatedAt,
  };
  yield* fromPromise("upsertStudyMastery", () =>
    db
      .insert(studyMasteryTable)
      .values(record)
      .onConflictDoUpdate({
        target: [studyMasteryTable.goalId, studyMasteryTable.planNodeId],
        set: {
          score: record.score,
          confidence: record.confidence,
          attempts: record.attempts,
          lastScore: record.lastScore,
          lastAssessedAt: record.lastAssessedAt,
          nextReviewAt: record.nextReviewAt,
          updatedAt,
        },
      })
  );
  return toStudyMastery(record);
});

const listStudyMastery = Effect.fnUntraced(function* (goalId: string) {
  const rows = yield* fromPromise("listStudyMastery", () =>
    db
      .select()
      .from(studyMasteryTable)
      .where(eq(studyMasteryTable.goalId, goalId))
  );
  return rows.map(toStudyMastery);
});

export {
  activateStudyPlan,
  createStudyCheck,
  createStudyPlan,
  createStudySessions,
  getLatestStudyPlan,
  getStudyGoalConfig,
  getStudyPlan,
  getStudySession,
  listStudyChecks,
  listStudyMastery,
  listStudySessions,
  updateStudyNodeEnrichment,
  updateStudySession,
  upsertStudyGoalConfig,
  upsertStudyMastery,
};
