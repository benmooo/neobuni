import type { StudyLessonEnrichment, StudyPlanNode } from "@neobuni/contracts";
import { z } from "zod";

import { createChatCompletion } from "../providers/openai-compatible-client";
import { resolveStudyReasoningConfig } from "./reasoning-config";

interface EnrichStudyLessonInput {
  desiredOutcome: string;
  goalTitle: string;
  node: StudyPlanNode;
  profileId: string;
}

const enrichmentResponseSchema = z.object({
  checkSpecs: z
    .array(
      z.object({
        answerKey: z.string().max(4000).nullable().default(null),
        kind: z.enum(["recall", "case"]),
        prompt: z.string().trim().min(1).max(4000),
        rubric: z.string().max(8000).nullable().default(null),
      })
    )
    .length(3),
  howText: z.string().trim().min(1).max(4000),
  objective: z.string().trim().min(1).max(2000),
  resources: z.array(z.string().trim().min(1).max(500)).max(8).default([]),
  whatText: z.string().trim().min(1).max(8000),
});

const ENRICHMENT_SYSTEM_PROMPT = `You are an expert coach for the Chinese 系统架构设计师 exam.

Rewrite ONE 30-45 minute lesson so it is concrete, exam-oriented, and immediately actionable.
- Keep the same topic and scope. Do not add unrelated subjects.
- "whatText" should list 3-5 specific concepts the learner will cover in this lesson.
- "howText" should be a timed study script (for example: 10 min read, 15 min draw, 10 min practice, 5 min recall).
- Return exactly 3 checks: 1 recall check and 2 case/transfer checks.
- For each check, provide a "rubric" with scoring points. For the recall check, also provide an "answerKey".
- "resources" is optional. Only include a resource when you are confident it exists; do not invent book page numbers or exam years.
- Write in Chinese. Be specific, but do not invent official facts.

Return JSON only, with no markdown fences or extra prose:
{"objective":"...","whatText":"...","howText":"...","checkSpecs":[{"kind":"recall","prompt":"...","rubric":"...","answerKey":"..."},{"kind":"case","prompt":"...","rubric":"...","answerKey":null},{"kind":"case","prompt":"...","rubric":"...","answerKey":null}],"resources":["..."]}`;

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const enrichStudyLesson = async (
  input: EnrichStudyLessonInput
): Promise<StudyLessonEnrichment | null> => {
  const config = await resolveStudyReasoningConfig(input.profileId);
  if (!config) {
    return null;
  }

  try {
    const text = await createChatCompletion(
      config,
      [
        { role: "system", content: ENRICHMENT_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            goal: {
              title: input.goalTitle,
              desiredOutcome: input.desiredOutcome,
            },
            lesson: {
              title: input.node.title,
              objective: input.node.objective,
              currentWhat: input.node.whatText,
              currentHow: input.node.howText,
              paper: input.node.paper,
              syllabusRefs: input.node.syllabusRefs,
              estimatedMinutes: input.node.estimatedMinutes,
              currentChecks: input.node.checkSpecs.map((check) => ({
                kind: check.kind,
                prompt: check.prompt,
              })),
            },
          }),
        },
      ],
      { maxTokens: 1800, temperature: 0.2 }
    );
    const parsed = enrichmentResponseSchema.parse(parseJson(text));
    const checkSpecs = parsed.checkSpecs.map((check, index) => ({
      answerKey: check.answerKey,
      id: `${input.node.id}.enriched.${index + 1}`,
      kind: check.kind,
      prompt: check.prompt,
      rubric: check.rubric,
    }));

    return {
      checkSpecs,
      enrichedAt: new Date().toISOString(),
      howText: parsed.howText,
      objective: parsed.objective,
      resources: parsed.resources,
      source: "llm",
      whatText: parsed.whatText,
    };
  } catch {
    return null;
  }
};

export type { EnrichStudyLessonInput };
export { enrichStudyLesson };
