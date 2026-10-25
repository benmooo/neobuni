import { describe, expect, test } from "vitest";

import {
  getStudyTemplate,
  studyTemplateSyllabusRefs,
  studyTemplateTotalMinutes,
  systemArchitect2026Template,
} from "./index";

const sumBy = <T>(items: T[], valueFor: (item: T) => number): number =>
  items.reduce((sum, item) => sum + valueFor(item), 0);

describe("system-architect-2026 template", () => {
  test("covers all three papers with at least one module each", () => {
    const papers = new Set(
      systemArchitect2026Template.modules.map((module) => module.paper)
    );

    expect(papers.has("comprehensive")).toBe(true);
    expect(papers.has("case")).toBe(true);
    expect(papers.has("essay")).toBe(true);
    expect(papers.has("shared")).toBe(true);
  });

  test("module weights sum to one", () => {
    expect(
      sumBy(systemArchitect2026Template.modules, (module) => module.weight)
    ).toBeCloseTo(1, 5);
  });

  test("each module distributes its topic weights to one", () => {
    for (const module of systemArchitect2026Template.modules) {
      expect(
        sumBy(module.topics, (topic) => topic.weight),
        `${module.id} topic weights`
      ).toBeCloseTo(1, 5);
    }
  });

  test("topic ids are unique and every topic has study actions", () => {
    const topicIds = systemArchitect2026Template.modules.flatMap((module) =>
      module.topics.map((topic) => topic.id)
    );

    expect(new Set(topicIds).size).toBe(topicIds.length);
    for (const module of systemArchitect2026Template.modules) {
      for (const topic of module.topics) {
        expect(topic.how.length).toBeGreaterThan(0);
        expect(topic.checkIdeas.length).toBeGreaterThan(0);
        expect(topic.learningGoal.length).toBeGreaterThan(0);
      }
    }
  });

  test("plans a substantial study workload", () => {
    expect(systemArchitect2026Template.modules.length).toBe(11);
    expect(
      studyTemplateTotalMinutes(systemArchitect2026Template)
    ).toBeGreaterThan(5000);
  });

  test("exposes a stable syllabus ref list and lookup", () => {
    const refs = studyTemplateSyllabusRefs(systemArchitect2026Template);

    expect(refs.length).toBe(
      systemArchitect2026Template.modules.reduce(
        (sum, module) => sum + module.topics.length,
        0
      )
    );
    expect(getStudyTemplate("system-architect-2026")).toBe(
      systemArchitect2026Template
    );
    expect(() => getStudyTemplate("missing")).toThrow(
      "Unknown study template: missing"
    );
  });
});
