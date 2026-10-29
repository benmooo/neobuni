import type {
  StudyLessonEnrichment,
  StudyLessonMaterial,
  StudyPlanNode,
} from "@neobuni/contracts";
import { textbookSourceTitle } from "@neobuni/core";
import { z } from "zod";

import { createChatCompletion } from "../providers/openai-compatible-client";
import { resolveStudyReasoningConfig } from "./reasoning-config";
import {
  type RetrievedExcerpt,
  retrieveTextbookExcerpts,
  toMaterialExcerpts,
} from "./textbook-retrieval";

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
- "whatText" lists 3-5 specific concepts, one per line, at most 120 characters in total.
- "howText" is a timed study script (for example: 10 min read, 15 min draw, 10 min practice, 5 min recall), at most 120 characters.
- "objective" is at most 40 characters.
- Return exactly 3 checks: 1 recall check and 2 case/transfer checks.
- Each check "prompt" is at most 60 characters and each "rubric" is at most 40 characters.
- For the recall check, also provide a short "answerKey".
- "resources" is optional. Only include a resource when you are confident it exists; do not invent book page numbers or exam years.
- Write in Chinese. Be specific, but do not invent official facts.

Stay strictly inside those limits. Long answers get truncated and the whole lesson is discarded.

Return JSON only, with no markdown fences or extra prose:
{"objective":"...","whatText":"...","howText":"...","checkSpecs":[{"kind":"recall","prompt":"...","rubric":"...","answerKey":"..."},{"kind":"case","prompt":"...","rubric":"...","answerKey":null},{"kind":"case","prompt":"...","rubric":"...","answerKey":null}],"resources":["..."]}`;

const materialResponseSchema = z.object({
  sections: z
    .array(
      z.object({
        body: z.string().trim().min(1).max(6000),
        heading: z.string().trim().min(1).max(120),
      })
    )
    .min(1)
    .max(6),
});

const buildMaterialPrompt = (excerpts: { locator: string; text: string }[]) =>
  `你是一位软考「系统架构设计师」教材编写者。下面是从官方教材摘录的原文片段，每段开头是位置标记。

${excerpts
  .map(
    (excerpt, index) =>
      `[片段${index + 1}] ${excerpt.locator}\n${excerpt.text.slice(0, 500)}`
  )
  .join("\n\n")}

请以这些原文为依据，写这节课的教材内容。要求：
- 只使用上面原文中的事实；原文没有的内容不要编造，尤其是数字、标准编号、版本号。
- 写成 3-4 个小节，标题从这些里选：概念讲解、怎么考、例题与思路、常见陷阱、记忆锚点。
- 每节 120-260 字，能直接读，不要列空泛的要点。
- 需要引用原文时，用「见 第N章 p.XXX」的格式，页码只能来自上面的位置标记。
- 用中文，不要 markdown 代码块。

只输出 JSON：
{"sections":[{"heading":"概念讲解","body":"..."}]}`;

const generateMaterial = async (input: {
  config: Parameters<typeof createChatCompletion>[0];
  excerpts: RetrievedExcerpt[];
  lessonTitle: string;
  objective: string;
}): Promise<StudyLessonMaterial | null> => {
  if (input.excerpts.length === 0) {
    return null;
  }

  const messages = [
    { role: "system" as const, content: buildMaterialPrompt(input.excerpts) },
    {
      role: "user" as const,
      content: JSON.stringify({
        lesson: { title: input.lessonTitle, objective: input.objective },
      }),
    },
  ];

  // One retry: reasoning models occasionally spend the whole budget on
  // `reasoning_content` or wrap the JSON in prose.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await createChatCompletion(input.config, messages, {
        maxTokens: 4000,
        temperature: attempt === 0 ? 0.2 : 0,
      });
      const parsed = materialResponseSchema.safeParse(parseJson(text));

      if (parsed.success) {
        return {
          excerpts: toMaterialExcerpts(input.excerpts),
          generatedAt: new Date().toISOString(),
          sections: parsed.data.sections,
          source: textbookSourceTitle(),
        };
      }
    } catch {
      // fall through to the retry
    }
  }

  // Material is additive: a failure here must not lose the summary + checks.
  return null;
};

/**
 * Models sometimes wrap JSON in markdown fences or add a sentence before it, so
 * a strict `JSON.parse` turns a usable answer into a failure.
 */
const parseJson = (text: string): unknown => {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to brace extraction
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
};

/**
 * Three outcomes instead of `null`: "no provider configured" and "provider call
 * failed" need different messages, otherwise a quota/auth/endpoint failure looks
 * like a missing configuration.
 */
type EnrichStudyLessonResult =
  | { status: "ok"; enrichment: StudyLessonEnrichment }
  | { status: "missing_provider" }
  | { status: "provider_error"; message: string };

const enrichStudyLesson = async (
  input: EnrichStudyLessonInput
): Promise<EnrichStudyLessonResult> => {
  const config = await resolveStudyReasoningConfig(input.profileId);
  if (!config) {
    return { status: "missing_provider" };
  }

  const textbookQuery = [
    input.node.title,
    input.node.objective,
    input.node.whatText,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .slice(0, 300);

  try {
    const [text, excerpts] = await Promise.all([
      createChatCompletion(
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
        // Reasoning models on OpenCode spend part of this budget on
        // `reasoning_content` before emitting `content`, so keep headroom.
        { maxTokens: 3000, temperature: 0.2 }
      ),
      retrieveTextbookExcerpts({
        profileId: input.profileId,
        query: textbookQuery,
        topicIds: input.node.syllabusRefs,
      }).catch(() => [] as RetrievedExcerpt[]),
    ]);

    const parsed = enrichmentResponseSchema.parse(parseJson(text));
    const checkSpecs = parsed.checkSpecs.map((check, index) => ({
      answerKey: check.answerKey,
      id: `${input.node.id}.enriched.${index + 1}`,
      kind: check.kind,
      prompt: check.prompt,
      rubric: check.rubric,
    }));

    const material = await generateMaterial({
      config,
      excerpts,
      lessonTitle: input.node.title,
      objective: parsed.objective,
    });

    return {
      status: "ok",
      enrichment: {
        checkSpecs,
        enrichedAt: new Date().toISOString(),
        howText: parsed.howText,
        material,
        objective: parsed.objective,
        resources: parsed.resources,
        source: "llm",
        whatText: parsed.whatText,
      },
    };
  } catch (error) {
    return {
      status: "provider_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

export type { EnrichStudyLessonInput, EnrichStudyLessonResult };
export { enrichStudyLesson };
