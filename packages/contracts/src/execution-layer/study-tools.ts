import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { studyCheckResultSchema } from "../study";

const studyTodayToolInputSchema = z.object({});
const studyTodayPrimarySchema = z.object({
  how: z.string().nullable(),
  minutes: z.number().int().positive(),
  scheduledFor: z.string(),
  title: z.string(),
  what: z.string().nullable(),
});
const studyTodayOutputSchema = z.object({
  coverage: z.number().min(0).max(1).nullable(),
  daysRemaining: z.number().int().nonnegative().nullable(),
  goalId: z.string().nullable(),
  goalTitle: z.string().nullable(),
  primary: studyTodayPrimarySchema.nullable(),
  readiness: z.number().min(0).max(1).nullable(),
  streakDays: z.number().int().nonnegative().nullable(),
});

const studyProgressToolInputSchema = z.object({});
const studyProgressPaperSchema = z.object({
  coverage: z.number().min(0).max(1),
  mastery: z.number().min(0).max(1),
  paper: z.string().min(1),
  readiness: z.number().min(0).max(1),
});
const studyProgressOutputSchema = z.object({
  coverage: z.number().min(0).max(1).nullable(),
  daysRemaining: z.number().int().nonnegative().nullable(),
  goalId: z.string().nullable(),
  goalTitle: z.string().nullable(),
  mastery: z.number().min(0).max(1).nullable(),
  minutesPerDayNeeded: z.number().nonnegative().nullable(),
  overallReadiness: z.number().min(0).max(1).nullable(),
  perPaper: z.array(studyProgressPaperSchema),
  projectedCoverage: z.number().min(0).max(1).nullable(),
  weakestPaper: z.string().nullable(),
});

const studyQuizToolInputSchema = z.object({});
const studyQuizReasonSchema = z.enum([
  "no_active_goal",
  "no_session_due",
  "no_checks",
]);
const studyQuizQuestionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["recall", "mcq", "case", "essay"]),
  prompt: z.string().min(1),
});
const studyQuizOutputSchema = z.object({
  available: z.boolean(),
  goalId: z.string().nullable(),
  lessonTitle: z.string().nullable(),
  objective: z.string().nullable(),
  questions: z.array(studyQuizQuestionSchema),
  reason: studyQuizReasonSchema.nullable(),
});

const studyQuizSubmitToolInputSchema = z.object({
  answers: z
    .array(
      z.object({
        answer: z.string().trim().min(1).max(40_000),
        promptId: z.string().min(1),
      })
    )
    .min(1)
    .max(10),
});
const studyQuizSubmitReasonSchema = z.enum([
  ...studyQuizReasonSchema.options,
  "unknown_prompt",
]);
const studyQuizSubmitOutputSchema = z.object({
  submitted: z.boolean(),
  reason: studyQuizSubmitReasonSchema.nullable(),
  result: studyCheckResultSchema.nullable(),
});

const studyTodayDef = toolDefinition({
  name: "study_today",
  description:
    "Return today's study step for the active study goal: what to learn, how to learn it, the planned minutes, and the current readiness.",
  inputSchema: studyTodayToolInputSchema,
  outputSchema: studyTodayOutputSchema,
});

const studyProgressDef = toolDefinition({
  name: "study_progress",
  description:
    "Return study progress for the active study goal: coverage, mastery, per-paper readiness, the weakest paper, pace forecast, and days remaining.",
  inputSchema: studyProgressToolInputSchema,
  outputSchema: studyProgressOutputSchema,
});

const studyQuizDef = toolDefinition({
  name: "study_quiz",
  description:
    "Return the check questions for today's study lesson so you can quiz the learner. Ask every question, one at a time if needed, and collect the answers before calling study_quiz_submit. Rubrics and answer keys are never returned.",
  inputSchema: studyQuizToolInputSchema,
  outputSchema: studyQuizOutputSchema,
});

const studyQuizSubmitDef = toolDefinition({
  name: "study_quiz_submit",
  description:
    "Grade the learner's answers for today's study lesson and persist the result: writes the check rows, updates mastery, completes the session, and schedules the next review. Use only promptId values returned by study_quiz. Questions the learner did not answer count as unattempted.",
  inputSchema: studyQuizSubmitToolInputSchema,
  outputSchema: studyQuizSubmitOutputSchema,
});

export {
  studyProgressDef,
  studyProgressOutputSchema,
  studyProgressToolInputSchema,
  studyQuizDef,
  studyQuizOutputSchema,
  studyQuizQuestionSchema,
  studyQuizSubmitDef,
  studyQuizSubmitOutputSchema,
  studyQuizSubmitToolInputSchema,
  studyQuizToolInputSchema,
  studyTodayDef,
  studyTodayOutputSchema,
  studyTodayToolInputSchema,
};

export type StudyProgressToolOutput = z.infer<typeof studyProgressOutputSchema>;
export type StudyQuizSubmitToolOutput = z.infer<
  typeof studyQuizSubmitOutputSchema
>;
export type StudyQuizToolOutput = z.infer<typeof studyQuizOutputSchema>;
export type StudyTodayToolOutput = z.infer<typeof studyTodayOutputSchema>;
