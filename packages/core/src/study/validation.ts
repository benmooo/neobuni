import type { StudyPlanDiagnostic, StudyPlanNode } from "@neobuni/contracts";

import {
  hasPrerequisiteCycle,
  listStudyLessons,
  totalStudyMinutes,
} from "./plan";

interface ValidateStudyPlanInput {
  availableMinutes?: number;
  maxLessonMinutes?: number;
  nodes: StudyPlanNode[];
  requiredSyllabusRefs?: readonly string[];
}

const error = (
  code: string,
  message: string,
  nodeId: string | null = null
): StudyPlanDiagnostic => ({ code, message, nodeId, severity: "error" });

const warning = (
  code: string,
  message: string,
  nodeId: string | null = null
): StudyPlanDiagnostic => ({ code, message, nodeId, severity: "warning" });

const validateStudyPlan = (
  input: ValidateStudyPlanInput
): StudyPlanDiagnostic[] => {
  const diagnostics: StudyPlanDiagnostic[] = [];
  const lessons = listStudyLessons(input.nodes);
  const maxLessonMinutes = input.maxLessonMinutes ?? 45;
  const nodeIds = new Set(input.nodes.map((node) => node.id));

  if (new Set(input.nodes.map((node) => node.id)).size !== input.nodes.length) {
    diagnostics.push(
      error("duplicate_node_id", "Plan node ids must be unique.")
    );
  }

  if (lessons.length === 0) {
    diagnostics.push(error("empty_plan", "The plan has no lessons."));
  }

  for (const lesson of lessons) {
    if (!lesson.objective) {
      diagnostics.push(
        error(
          "missing_objective",
          "A lesson needs a testable objective.",
          lesson.id
        )
      );
    }
    if (!lesson.whatText) {
      diagnostics.push(
        error("missing_what", "A lesson needs a `what` description.", lesson.id)
      );
    }
    if (!lesson.howText) {
      diagnostics.push(
        error(
          "missing_how",
          "A lesson needs an actionable `how` description.",
          lesson.id
        )
      );
    }
    if (lesson.estimatedMinutes > maxLessonMinutes) {
      diagnostics.push(
        error(
          "lesson_too_long",
          `A lesson must stay within ${maxLessonMinutes} minutes.`,
          lesson.id
        )
      );
    }
    if (lesson.estimatedMinutes < 5) {
      diagnostics.push(
        warning(
          "lesson_too_short",
          "A lesson under 5 minutes is hard to verify.",
          lesson.id
        )
      );
    }
    if (lesson.checkSpecs.length < 3) {
      diagnostics.push(
        error(
          "missing_checks",
          "A lesson needs three checks: recall, apply, and transfer.",
          lesson.id
        )
      );
    }
    for (const prerequisite of lesson.prerequisites) {
      if (!nodeIds.has(prerequisite)) {
        diagnostics.push(
          error(
            "unknown_prerequisite",
            `Unknown prerequisite: ${prerequisite}`,
            lesson.id
          )
        );
      }
    }
    if (lesson.syllabusRefs.length === 0) {
      diagnostics.push(
        warning(
          "lesson_without_syllabus_ref",
          "This lesson is not mapped to a syllabus topic.",
          lesson.id
        )
      );
    }
  }

  if (hasPrerequisiteCycle(input.nodes)) {
    diagnostics.push(
      error("prerequisite_cycle", "Lesson prerequisites must be acyclic.")
    );
  }

  const requiredRefs = input.requiredSyllabusRefs ?? [];
  if (requiredRefs.length > 0) {
    const coveredRefs = new Set(
      lessons.flatMap((lesson) => lesson.syllabusRefs)
    );
    const missingRefs = requiredRefs.filter((ref) => !coveredRefs.has(ref));
    for (const ref of missingRefs) {
      diagnostics.push(
        error(
          "missing_syllabus_coverage",
          `No lesson covers syllabus topic: ${ref}`
        )
      );
    }
  }

  if (input.availableMinutes !== undefined) {
    const requiredMinutes = totalStudyMinutes(input.nodes);
    if (requiredMinutes > input.availableMinutes) {
      diagnostics.push(
        error(
          "over_time_budget",
          `The plan needs ${requiredMinutes} minutes but only ${input.availableMinutes} are available.`
        )
      );
    }
  }

  const lessonAncestors = new Set<string>();
  const parentById = new Map(
    input.nodes.map((node) => [node.id, node.parentId])
  );
  for (const lesson of lessons) {
    let cursor = lesson.parentId;
    while (cursor) {
      lessonAncestors.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
  }

  for (const node of input.nodes) {
    if (node.parentId && !nodeIds.has(node.parentId)) {
      diagnostics.push(
        error(
          "unknown_parent",
          `Unknown parent node: ${node.parentId}`,
          node.id
        )
      );
    }
    if (node.kind !== "lesson" && !lessonAncestors.has(node.id)) {
      diagnostics.push(
        warning(
          "empty_container",
          "This plan node has no lessons underneath it.",
          node.id
        )
      );
    }
  }

  return diagnostics;
};

const isStudyPlanValid = (diagnostics: StudyPlanDiagnostic[]): boolean =>
  diagnostics.every((diagnostic) => diagnostic.severity !== "error");

export type { ValidateStudyPlanInput };
export { isStudyPlanValid, validateStudyPlan };
