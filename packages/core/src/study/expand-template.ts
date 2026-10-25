import type {
  StudyPlanDiagnostic,
  StudyPlanNode,
  StudySyllabusTemplate,
  StudyTemplateTopic,
} from "@neobuni/contracts";

import { studyTemplateSyllabusRefs } from "./templates";
import { validateStudyPlan } from "./validation";

interface BuildStudyPlanDraftInput {
  availableMinutes?: number;
  maxLessonMinutes?: number;
  planId: string;
  template: StudySyllabusTemplate;
}

interface BuildStudyPlanDraftResult {
  diagnostics: StudyPlanDiagnostic[];
  lessonCount: number;
  nodes: StudyPlanNode[];
  totalMinutes: number;
}

const splitTopicMinutes = (
  totalMinutes: number,
  maxLessonMinutes: number
): number[] => {
  const count = Math.max(1, Math.ceil(totalMinutes / maxLessonMinutes));
  const base = Math.floor(totalMinutes / count);
  const remainder = totalMinutes - base * count;
  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base
  );
};

const partLabel = (part: number, count: number): string => {
  if (count === 1) {
    return "";
  }
  if (part === 1) {
    return "概念与框架";
  }
  if (part === 2) {
    return "方法与取舍";
  }
  if (part === 3) {
    return "案例与检查";
  }
  return `深化 ${part}/${count}`;
};

const lessonObjective = (
  topic: StudyTemplateTopic,
  part: number,
  count: number
): string => {
  if (count === 1) {
    return topic.learningGoal;
  }
  if (part === 1) {
    return `能解释：${topic.learningGoal}`;
  }
  if (part === 2) {
    return `能应用：${topic.learningGoal}`;
  }
  return `能迁移：${topic.learningGoal}`;
};

const lessonWhat = (
  topic: StudyTemplateTopic,
  part: number,
  count: number
): string => {
  const label = partLabel(part, count);
  const suffix =
    topic.keywords.length > 0 ? ` 关键词：${topic.keywords.join("、")}。` : "";
  return `${topic.title}${label ? `（${label}）` : ""}：${topic.learningGoal}。${suffix}`.trim();
};

const lessonHow = (
  topic: StudyTemplateTopic,
  part: number,
  count: number
): string => {
  const action =
    topic.how[(part - 1) % topic.how.length] ??
    "先读一遍本主题的核心概念，再画一张结构图";
  const closing =
    part === count
      ? "完成后立即做 3 道检查题，答不上的点写进错题本。"
      : "完成后用 1 分钟复述本课要点，再进入下一节。";
  return `${action}。${closing}`;
};

const lessonCheckSpecs = (
  topic: StudyTemplateTopic,
  lessonId: string,
  part: number,
  count: number
) => {
  const applyIdea =
    topic.checkIdeas[(part - 1) % topic.checkIdeas.length] ??
    "结合一个真实系统说明本主题如何落地";
  const transferIdea =
    topic.checkIdeas[part % topic.checkIdeas.length] ??
    "如果约束变化，你会如何调整方案";

  return [
    {
      id: `${lessonId}.check.1`,
      kind: "recall" as const,
      prompt: `不看资料，用自己的话解释：${topic.learningGoal}`,
      rubric: null,
      answerKey: null,
    },
    {
      id: `${lessonId}.check.2`,
      kind: "case" as const,
      prompt: `围绕「${topic.title}」回答：${applyIdea}`,
      rubric: null,
      answerKey: null,
    },
    {
      id: `${lessonId}.check.3`,
      kind: "case" as const,
      prompt:
        count > 1 && part < count
          ? `围绕「${topic.title}」回答：${transferIdea}`
          : `如果规模扩大 10 倍、预算减半或合规要求提高，你会如何调整「${topic.title}」相关方案？`,
      rubric: null,
      answerKey: null,
    },
  ];
};

const buildStudyPlanDraft = (
  input: BuildStudyPlanDraftInput
): BuildStudyPlanDraftResult => {
  const maxLessonMinutes = input.maxLessonMinutes ?? 45;
  const nodes: StudyPlanNode[] = [];
  const idOf = (stableId: string) => `${input.planId}:${stableId}`;
  let order = 0;
  let totalMinutes = 0;
  let lessonCount = 0;

  for (const module of input.template.modules) {
    const moduleId = idOf(module.id);
    nodes.push({
      id: moduleId,
      planId: input.planId,
      parentId: null,
      kind: "module",
      order,
      title: module.title,
      objective: null,
      whatText: null,
      howText: null,
      resources: [],
      estimatedMinutes: 0,
      weight: 0,
      paper: module.paper,
      syllabusRefs: [],
      prerequisites: [],
      checkSpecs: [],
    });
    order += 1;

    for (const topic of module.topics) {
      const topicId = idOf(topic.id);
      nodes.push({
        id: topicId,
        planId: input.planId,
        parentId: moduleId,
        kind: "topic",
        order,
        title: topic.title,
        objective: topic.learningGoal,
        whatText: topic.learningGoal,
        howText: topic.how.join("；"),
        resources: [],
        estimatedMinutes: 0,
        weight: 0,
        paper: module.paper,
        syllabusRefs: [topic.id],
        prerequisites: [],
        checkSpecs: [],
      });
      order += 1;

      const minutes = splitTopicMinutes(topic.minutes, maxLessonMinutes);
      const lessonWeight = (module.weight * topic.weight) / minutes.length;
      let previousLessonId: string | null = null;

      for (const [index, durationMinutes] of minutes.entries()) {
        const part = index + 1;
        const count = minutes.length;
        const lessonId = idOf(`lesson.${topic.id}.${part}`);
        const label = partLabel(part, count);
        nodes.push({
          id: lessonId,
          planId: input.planId,
          parentId: topicId,
          kind: "lesson",
          order,
          title: label ? `${topic.title} · ${label}` : topic.title,
          objective: lessonObjective(topic, part, count),
          whatText: lessonWhat(topic, part, count),
          howText: lessonHow(topic, part, count),
          resources: [],
          estimatedMinutes: durationMinutes,
          weight: lessonWeight,
          paper: module.paper,
          syllabusRefs: [topic.id],
          prerequisites: previousLessonId ? [previousLessonId] : [],
          checkSpecs: lessonCheckSpecs(topic, lessonId, part, count),
        });
        order += 1;
        totalMinutes += durationMinutes;
        lessonCount += 1;
        previousLessonId = lessonId;
      }
    }
  }

  const diagnostics = validateStudyPlan({
    availableMinutes: input.availableMinutes,
    maxLessonMinutes,
    nodes,
    requiredSyllabusRefs: studyTemplateSyllabusRefs(input.template),
  });

  return { diagnostics, lessonCount, nodes, totalMinutes };
};

export type { BuildStudyPlanDraftInput, BuildStudyPlanDraftResult };
export { buildStudyPlanDraft, splitTopicMinutes };
