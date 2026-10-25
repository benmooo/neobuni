import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

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

export {
  studyProgressDef,
  studyProgressOutputSchema,
  studyProgressToolInputSchema,
  studyTodayDef,
  studyTodayOutputSchema,
  studyTodayToolInputSchema,
};

export type StudyProgressToolOutput = z.infer<typeof studyProgressOutputSchema>;
export type StudyTodayToolOutput = z.infer<typeof studyTodayOutputSchema>;
