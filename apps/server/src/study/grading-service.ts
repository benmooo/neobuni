import {
  getMemoryReasoningProviderConfig,
  getProviderConfig,
  runRepo,
} from "@neobuni/db";
import { z } from "zod";

import { toOpenAICompatibleConfig } from "../digest/memory-provider-config";
import {
  createChatCompletion,
  type OpenAICompatibleConfig,
} from "../providers/openai-compatible-client";

interface StudyCheckToGrade {
  answer: string;
  id: string;
  prompt: string;
  rubric: string | null;
}

interface StudyGrade {
  feedback: string;
  missingPoints: string[];
  passed: boolean;
  promptId: string;
  score: number;
}

interface StudyGradeResult {
  gradedBy: "deterministic" | "llm";
  grades: StudyGrade[];
}

const PASS_THRESHOLD = 0.6;

const gradeResponseSchema = z.object({
  grades: z.array(
    z.object({
      feedback: z.string().max(8000),
      missingPoints: z.array(z.string().max(500)).max(16).default([]),
      promptId: z.string().min(1),
      score: z.number().min(0).max(1),
    })
  ),
});

const GRADING_SYSTEM_PROMPT = `You are grading a study check for the Chinese 系统架构设计师 exam.

Grade each answer from 0 to 1 against the lesson objective and the question.
- 0.8-1.0: accurate, specific, and explains trade-offs or a concrete example.
- 0.6-0.79: basically correct, but misses an important detail.
- 0.3-0.59: partial understanding with a clear gap.
- 0.0-0.29: wrong, empty, or only repeats the question.

Be strict but fair. A learner at 0.6+ should be able to explain or apply the idea without notes.

Return JSON only, with no markdown fences or extra prose:
{"grades":[{"promptId":"...","score":0.0,"feedback":"...","missingPoints":["..."]}]}`;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const fallbackGrade = (check: StudyCheckToGrade): StudyGrade => {
  const length = check.answer.trim().length;
  const score = length === 0 ? 0 : length < 20 ? 0.25 : length < 80 ? 0.5 : 0.7;
  return {
    feedback:
      "评分模型暂不可用，已按答案完整度兜底。请把这题当作未完全掌握，稍后重试或重学。",
    missingPoints: [],
    passed: score >= PASS_THRESHOLD,
    promptId: check.id,
    score,
  };
};

const fallbackResult = (checks: StudyCheckToGrade[]): StudyGradeResult => ({
  grades: checks.map(fallbackGrade),
  gradedBy: "deterministic",
});

const resolveGradingConfig = async (
  profileId: string
): Promise<OpenAICompatibleConfig | null> => {
  const [reasoning, chat] = await Promise.all([
    runRepo(getMemoryReasoningProviderConfig(profileId)),
    runRepo(getProviderConfig(profileId)),
  ]);
  return toOpenAICompatibleConfig(reasoning) ?? toOpenAICompatibleConfig(chat);
};

const gradeStudyChecks = async (input: {
  checks: StudyCheckToGrade[];
  lessonTitle: string;
  objective: string;
  profileId: string;
}): Promise<StudyGradeResult> => {
  if (input.checks.length === 0) {
    return { grades: [], gradedBy: "deterministic" };
  }

  const config = await resolveGradingConfig(input.profileId);
  if (!config) {
    return fallbackResult(input.checks);
  }

  try {
    const text = await createChatCompletion(
      config,
      [
        { role: "system", content: GRADING_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            lesson: {
              title: input.lessonTitle,
              objective: input.objective,
            },
            checks: input.checks.map((check) => ({
              promptId: check.id,
              question: check.prompt,
              rubric: check.rubric,
              answer: check.answer,
            })),
          }),
        },
      ],
      { maxTokens: 1500, temperature: 0 }
    );
    const parsed = gradeResponseSchema.parse(parseJson(text));
    const byPrompt = new Map(
      parsed.grades.map((grade) => [grade.promptId, grade])
    );
    const grades = input.checks.map((check) => {
      const grade = byPrompt.get(check.id);
      if (!grade) {
        return fallbackGrade(check);
      }
      const score = clamp01(grade.score);
      return {
        feedback: grade.feedback,
        missingPoints: grade.missingPoints,
        passed: score >= PASS_THRESHOLD,
        promptId: check.id,
        score,
      };
    });
    return { grades, gradedBy: "llm" };
  } catch {
    return fallbackResult(input.checks);
  }
};

export type { StudyCheckToGrade, StudyGrade, StudyGradeResult };
export { gradeStudyChecks, PASS_THRESHOLD };
