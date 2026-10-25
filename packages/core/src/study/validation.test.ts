import type { StudyCheckSpec, StudyPlanNode } from "@neobuni/contracts";
import { describe, expect, test } from "vitest";

import { isStudyPlanValid, validateStudyPlan } from "./validation";

const checkSpecs: StudyCheckSpec[] = [
  {
    id: "check-1",
    kind: "recall",
    prompt: "Recall",
    rubric: null,
    answerKey: null,
  },
  {
    id: "check-2",
    kind: "case",
    prompt: "Apply",
    rubric: null,
    answerKey: null,
  },
  {
    id: "check-3",
    kind: "case",
    prompt: "Transfer",
    rubric: null,
    answerKey: null,
  },
];

const makeLesson = (overrides: Partial<StudyPlanNode> = {}): StudyPlanNode => ({
  id: "lesson-1",
  planId: "plan-1",
  parentId: "topic-1",
  kind: "lesson",
  order: 1,
  title: "Quality attributes",
  objective: "Explain quality attributes and trade-offs",
  whatText: "Quality attributes, scenarios, tactics",
  howText: "Draw a quality attribute scenario, then explain two tactics",
  resources: [],
  estimatedMinutes: 40,
  weight: 1,
  paper: "case",
  syllabusRefs: ["architecture.quality"],
  prerequisites: [],
  checkSpecs,
  ...overrides,
});

const makePlan = (
  lessons: Partial<StudyPlanNode>[] = [{}]
): StudyPlanNode[] => [
  makeLesson({
    id: "phase-1",
    kind: "phase",
    parentId: null,
    order: 0,
    objective: null,
    whatText: null,
    howText: null,
    estimatedMinutes: 0,
    weight: 0,
    checkSpecs: [],
    syllabusRefs: [],
  }),
  makeLesson({
    id: "module-1",
    kind: "module",
    parentId: "phase-1",
    order: 0,
    objective: null,
    whatText: null,
    howText: null,
    estimatedMinutes: 0,
    weight: 0,
    checkSpecs: [],
    syllabusRefs: [],
  }),
  makeLesson({
    id: "topic-1",
    kind: "topic",
    parentId: "module-1",
    order: 0,
    objective: null,
    whatText: null,
    howText: null,
    estimatedMinutes: 0,
    weight: 0,
    checkSpecs: [],
    syllabusRefs: [],
  }),
  ...lessons.map((lesson) => makeLesson(lesson)),
];

describe("validateStudyPlan", () => {
  test("accepts a small, complete lesson", () => {
    const diagnostics = validateStudyPlan({
      nodes: makePlan(),
      requiredSyllabusRefs: ["architecture.quality"],
      availableMinutes: 90,
    });

    expect(diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(isStudyPlanValid(diagnostics)).toBe(true);
  });

  test("rejects a lesson that is too long", () => {
    const diagnostics = validateStudyPlan({
      nodes: makePlan([{ estimatedMinutes: 60 }]),
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: "lesson_too_long", severity: "error" })
    );
    expect(isStudyPlanValid(diagnostics)).toBe(false);
  });

  test("rejects a lesson without three checks", () => {
    const diagnostics = validateStudyPlan({
      nodes: makePlan([{ checkSpecs: checkSpecs.slice(0, 1) }]),
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing_checks" })
    );
  });

  test("rejects missing syllabus coverage", () => {
    const diagnostics = validateStudyPlan({
      nodes: makePlan(),
      requiredSyllabusRefs: ["architecture.quality", "architecture.security"],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing_syllabus_coverage" })
    );
  });

  test("rejects prerequisite cycles", () => {
    const diagnostics = validateStudyPlan({
      nodes: makePlan([
        { id: "lesson-2", order: 2, prerequisites: ["lesson-1"] },
        { id: "lesson-1", order: 1, prerequisites: ["lesson-2"] },
      ]),
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: "prerequisite_cycle" })
    );
  });

  test("rejects a plan over the time budget", () => {
    const diagnostics = validateStudyPlan({
      nodes: makePlan([{}, { id: "lesson-2", order: 2 }]),
      availableMinutes: 60,
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: "over_time_budget" })
    );
  });
});
