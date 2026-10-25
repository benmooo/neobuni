import { z } from "zod";
import { autonomyModeSchema } from "../decision";
import { channelTargetSchema } from "../execution-layer/channel-target";
import { idSchema, isoDateTimeSchema } from "../platform/common/base";

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a local date (YYYY-MM-DD)");
const localDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
    "Expected a local date-time (YYYY-MM-DDTHH:mm)"
  );
const clockTimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Expected a clock time (HH:mm)");

const studyPaperSchema = z.enum(["comprehensive", "case", "essay", "shared"]);
const studyNodeKindSchema = z.enum(["phase", "module", "topic", "lesson"]);
const studyPlanStatusSchema = z.enum(["draft", "active", "superseded"]);
const studySessionStatusSchema = z.enum([
  "planned",
  "in_progress",
  "completed",
  "skipped",
  "missed",
]);
const studyCheckKindSchema = z.enum(["recall", "mcq", "case", "essay", "mock"]);
const studyGradedBySchema = z.enum(["deterministic", "llm"]);
const studyDiagnosticSeveritySchema = z.enum(["error", "warning"]);

const studyPlanStyleSchema = z.object({
  maxLessonMinutes: z.number().int().min(10).max(60).default(45),
  minLessonMinutes: z.number().int().min(5).max(45).default(20),
  reviewRatio: z.number().min(0).max(0.6).default(0.35),
});

const studyStudyWindowSchema = z
  .object({
    start: clockTimeSchema,
    end: clockTimeSchema,
  })
  .refine((value) => value.start < value.end, {
    message: "Study window start must be before end",
  });

const studyGoalConfigSchema = z.object({
  targetAt: isoDateTimeSchema,
  dailyMinutes: z.number().int().min(15).max(480),
  studyWindow: studyStudyWindowSchema,
  restDays: z.array(z.number().int().min(0).max(6)).max(7).default([0]),
  timezone: z.string().trim().min(1).max(80).default("Asia/Shanghai"),
  quietHours: studyStudyWindowSchema.nullable().default(null),
  channels: z.array(channelTargetSchema).max(4).default([]),
  syllabusTemplateId: z.string().trim().min(1).max(120),
  planStyle: studyPlanStyleSchema.default({
    maxLessonMinutes: 45,
    minLessonMinutes: 20,
    reviewRatio: 0.35,
  }),
});

const studyCheckSpecSchema = z.object({
  id: idSchema,
  kind: studyCheckKindSchema.exclude(["mock"]),
  prompt: z.string().trim().min(1).max(4000),
  rubric: z.string().max(8000).nullable().default(null),
  answerKey: z.string().max(4000).nullable().default(null),
});

const studyPlanDiagnosticSchema = z.object({
  code: z.string().trim().min(1).max(80),
  severity: studyDiagnosticSeveritySchema,
  nodeId: idSchema.nullable().default(null),
  message: z.string().trim().min(1).max(500),
});

const studyTemplateTopicSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(200),
  weight: z.number().min(0).max(1),
  minutes: z.number().int().min(15).max(600),
  learningGoal: z.string().trim().min(1).max(500),
  how: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
  checkIdeas: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
  keywords: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
});

const studyTemplateModuleSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(200),
  paper: studyPaperSchema,
  weight: z.number().min(0).max(1),
  topics: z.array(studyTemplateTopicSchema).min(1).max(24),
});

const studySyllabusTemplateSchema = z.object({
  id: z.string().trim().min(1).max(120),
  exam: z.string().trim().min(1).max(200),
  level: z.enum(["junior", "intermediate", "senior"]),
  version: z.string().trim().min(1).max(40),
  source: z.string().trim().min(1).max(500),
  modules: z.array(studyTemplateModuleSchema).min(1).max(32),
});

const studyPlanNodeSchema = z.object({
  id: idSchema,
  planId: idSchema,
  parentId: idSchema.nullable(),
  kind: studyNodeKindSchema,
  order: z.number().int().min(0),
  title: z.string().trim().min(1).max(500),
  objective: z.string().trim().min(1).max(2000).nullable(),
  whatText: z.string().trim().min(1).max(8000).nullable(),
  howText: z.string().trim().min(1).max(4000).nullable(),
  resources: z.array(z.string().trim().min(1).max(500)).max(16).default([]),
  estimatedMinutes: z.number().int().min(0).max(120),
  weight: z.number().min(0).max(1),
  paper: studyPaperSchema,
  syllabusRefs: z.array(z.string().trim().min(1).max(200)).max(32).default([]),
  prerequisites: z.array(idSchema).max(16).default([]),
  checkSpecs: z.array(studyCheckSpecSchema).max(5).default([]),
});

const studyPlanSchema = z.object({
  id: idSchema,
  profileId: idSchema,
  goalId: idSchema,
  version: z.number().int().positive(),
  status: studyPlanStatusSchema,
  templateId: z.string().trim().min(1).max(120),
  diagnostics: z.array(studyPlanDiagnosticSchema).default([]),
  createdAt: isoDateTimeSchema,
  activatedAt: isoDateTimeSchema.nullable(),
});

const studyPlanViewSchema = z.object({
  plan: studyPlanSchema,
  nodes: z.array(studyPlanNodeSchema),
});

const studySessionSchema = z.object({
  id: idSchema,
  profileId: idSchema,
  goalId: idSchema,
  planNodeId: idSchema,
  scheduledFor: localDateTimeSchema,
  timezone: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().min(5).max(480),
  status: studySessionStatusSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  actualMinutes: z.number().int().min(0).max(480).nullable(),
  rescheduledFrom: localDateTimeSchema.nullable(),
  notes: z.string().max(4000).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

const studySessionWithNodeSchema = z.object({
  session: studySessionSchema,
  node: studyPlanNodeSchema,
});

const studyMasterySchema = z.object({
  goalId: idSchema,
  planNodeId: idSchema,
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  attempts: z.number().int().nonnegative(),
  lastScore: z.number().min(0).max(1).nullable(),
  lastAssessedAt: isoDateTimeSchema.nullable(),
  nextReviewAt: localDateSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});

const studyCheckSchema = z.object({
  id: idSchema,
  profileId: idSchema,
  goalId: idSchema,
  sessionId: idSchema.nullable(),
  planNodeId: idSchema,
  kind: studyCheckKindSchema,
  prompt: z.string().trim().min(1).max(8000),
  answer: z.string().max(40_000).nullable(),
  rubric: z.string().max(8000).nullable(),
  score: z.number().min(0).nullable(),
  maxScore: z.number().positive(),
  passed: z.boolean().nullable(),
  gradedBy: studyGradedBySchema.nullable(),
  feedback: z.string().max(8000).nullable(),
  createdAt: isoDateTimeSchema,
});

const studyPaperReadinessSchema = z.object({
  paper: studyPaperSchema,
  coverage: z.number().min(0).max(1),
  mastery: z.number().min(0).max(1),
  mockScore: z.number().min(0).max(75).nullable(),
  readiness: z.number().min(0).max(1),
});

const studyProgressSchema = z.object({
  goalId: idSchema,
  generatedAt: isoDateTimeSchema,
  targetAt: isoDateTimeSchema,
  daysRemaining: z.number().int().nonnegative(),
  coverage: z.number().min(0).max(1),
  mastery: z.number().min(0).max(1),
  overallReadiness: z.number().min(0).max(1),
  sessionsCompleted: z.number().int().nonnegative(),
  sessionsPlanned: z.number().int().nonnegative(),
  dueSessions: z.number().int().nonnegative(),
  adherenceRate: z.number().min(0).max(1).nullable(),
  streakDays: z.number().int().nonnegative(),
  totalMinutes: z.number().int().nonnegative(),
  projectedCoverage: z.number().min(0).max(1),
  minutesPerDayNeeded: z.number().nonnegative(),
  perPaper: z.array(studyPaperReadinessSchema).min(1),
});

const studyTodaySchema = z.object({
  goalId: idSchema,
  localDate: localDateSchema,
  primary: studySessionWithNodeSchema.nullable(),
  upcoming: z.array(studySessionWithNodeSchema).max(14),
  progress: studyProgressSchema,
});

const studyGoalCreateSchema = z.object({
  title: z.string().trim().min(1).max(500),
  desiredOutcome: z.string().trim().min(1).max(4000),
  autonomyMode: autonomyModeSchema.default("collaborate"),
  config: studyGoalConfigSchema,
});

const studyPlanGenerateSchema = z.object({
  goalId: idSchema,
  templateId: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
});

const studySessionIdSchema = z.object({ sessionId: idSchema });

const studySessionCompleteSchema = z.object({
  sessionId: idSchema,
  actualMinutes: z.number().int().min(0).max(480),
  notes: z.string().trim().max(4000).optional(),
});

const studySessionRescheduleSchema = z.object({
  sessionId: idSchema,
  scheduledFor: localDateTimeSchema,
});

const studyCheckAnswerSchema = z.object({
  promptId: idSchema,
  answer: z.string().trim().min(1).max(40_000),
});

const studyCheckSubmitSchema = z.object({
  sessionId: idSchema,
  answers: z.array(studyCheckAnswerSchema).min(1).max(10),
});

const studyCheckGradeItemSchema = z.object({
  promptId: idSchema,
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  feedback: z.string().max(8000),
  missingPoints: z.array(z.string().max(500)).max(16).default([]),
});

const studyCheckResultSchema = z.object({
  checkIds: z.array(idSchema).min(1),
  score: z.number().min(0).max(1),
  maxScore: z.number().positive(),
  passed: z.boolean(),
  feedback: z.string().max(8000).nullable(),
  items: z.array(studyCheckGradeItemSchema).min(1),
  mastery: z.number().min(0).max(1),
  nextReviewAt: localDateSchema.nullable(),
  needsReteach: z.boolean(),
});

const studyProgressInputSchema = z.object({ goalId: idSchema });
const studyGoalParamSchema = z.object({ goalId: idSchema });
const studyGoalConfigUpdateSchema = z.object({
  goalId: idSchema,
  config: studyGoalConfigSchema,
});
const studyPlanActivateSchema = z.object({
  goalId: idSchema,
  planId: idSchema,
});

export {
  localDateSchema,
  localDateTimeSchema,
  studyCheckAnswerSchema,
  studyCheckGradeItemSchema,
  studyCheckKindSchema,
  studyCheckResultSchema,
  studyCheckSchema,
  studyCheckSpecSchema,
  studyCheckSubmitSchema,
  studyDiagnosticSeveritySchema,
  studyGoalConfigSchema,
  studyGoalConfigUpdateSchema,
  studyGoalCreateSchema,
  studyGoalParamSchema,
  studyGradedBySchema,
  studyMasterySchema,
  studyNodeKindSchema,
  studyPaperReadinessSchema,
  studyPaperSchema,
  studyPlanActivateSchema,
  studyPlanDiagnosticSchema,
  studyPlanGenerateSchema,
  studyPlanNodeSchema,
  studyPlanSchema,
  studyPlanStatusSchema,
  studyPlanStyleSchema,
  studyPlanViewSchema,
  studyProgressInputSchema,
  studyProgressSchema,
  studySessionCompleteSchema,
  studySessionIdSchema,
  studySessionRescheduleSchema,
  studySessionSchema,
  studySessionStatusSchema,
  studySessionWithNodeSchema,
  studyStudyWindowSchema,
  studySyllabusTemplateSchema,
  studyTemplateModuleSchema,
  studyTemplateTopicSchema,
  studyTodaySchema,
};

export type StudyCheck = z.infer<typeof studyCheckSchema>;
export type StudyCheckAnswer = z.infer<typeof studyCheckAnswerSchema>;
export type StudyCheckGradeItem = z.infer<typeof studyCheckGradeItemSchema>;
export type StudyCheckKind = z.infer<typeof studyCheckKindSchema>;
export type StudyCheckResult = z.infer<typeof studyCheckResultSchema>;
export type StudyCheckSpec = z.infer<typeof studyCheckSpecSchema>;
export type StudyGoalConfig = z.infer<typeof studyGoalConfigSchema>;
export type StudyGoalConfigUpdate = z.infer<typeof studyGoalConfigUpdateSchema>;
export type StudyGoalCreate = z.infer<typeof studyGoalCreateSchema>;
export type StudyGoalParam = z.infer<typeof studyGoalParamSchema>;
export type StudyPlanActivate = z.infer<typeof studyPlanActivateSchema>;
export type StudyMastery = z.infer<typeof studyMasterySchema>;
export type StudyNodeKind = z.infer<typeof studyNodeKindSchema>;
export type StudyPaper = z.infer<typeof studyPaperSchema>;
export type StudyPaperReadiness = z.infer<typeof studyPaperReadinessSchema>;
export type StudyPlan = z.infer<typeof studyPlanSchema>;
export type StudyPlanDiagnostic = z.infer<typeof studyPlanDiagnosticSchema>;
export type StudyPlanGenerate = z.infer<typeof studyPlanGenerateSchema>;
export type StudyPlanNode = z.infer<typeof studyPlanNodeSchema>;
export type StudyPlanStyle = z.infer<typeof studyPlanStyleSchema>;
export type StudyPlanView = z.infer<typeof studyPlanViewSchema>;
export type StudyProgress = z.infer<typeof studyProgressSchema>;
export type StudySession = z.infer<typeof studySessionSchema>;
export type StudySessionStatus = z.infer<typeof studySessionStatusSchema>;
export type StudySessionComplete = z.infer<typeof studySessionCompleteSchema>;
export type StudySessionReschedule = z.infer<
  typeof studySessionRescheduleSchema
>;
export type StudySessionWithNode = z.infer<typeof studySessionWithNodeSchema>;
export type StudyToday = z.infer<typeof studyTodaySchema>;
export type StudySyllabusTemplate = z.infer<typeof studySyllabusTemplateSchema>;
export type StudyTemplateModule = z.infer<typeof studyTemplateModuleSchema>;
export type StudyTemplateTopic = z.infer<typeof studyTemplateTopicSchema>;
