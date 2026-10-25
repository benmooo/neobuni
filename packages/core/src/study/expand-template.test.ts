import { describe, expect, test } from "vitest";

import { buildStudyPlanDraft, splitTopicMinutes } from "./expand-template";
import { systemArchitect2026Template } from "./templates";

const plan = buildStudyPlanDraft({
  planId: "plan-1",
  template: systemArchitect2026Template,
});

const lessons = plan.nodes.filter((node) => node.kind === "lesson");
const topics = plan.nodes.filter((node) => node.kind === "topic");
const modules = plan.nodes.filter((node) => node.kind === "module");

describe("splitTopicMinutes", () => {
  test("keeps every part within the lesson cap", () => {
    expect(splitTopicMinutes(120, 45)).toEqual([40, 40, 40]);
    expect(splitTopicMinutes(150, 45)).toEqual([38, 38, 37, 37]);
    expect(splitTopicMinutes(15, 45)).toEqual([15]);
    expect(splitTopicMinutes(46, 45)).toEqual([23, 23]);
  });

  test("never loses minutes to rounding", () => {
    const parts = splitTopicMinutes(6300, 45);
    expect(parts.reduce((sum, value) => sum + value, 0)).toBe(6300);
    expect(Math.max(...parts)).toBeLessThanOrEqual(45);
  });
});

describe("buildStudyPlanDraft", () => {
  test("expands the template into modules, topics and lessons", () => {
    expect(modules).toHaveLength(11);
    expect(topics).toHaveLength(62);
    expect(plan.lessonCount).toBe(lessons.length);
    expect(plan.totalMinutes).toBe(6300);
    expect(lessons.length).toBeGreaterThan(62);
    expect(lessons.every((lesson) => lesson.id.startsWith("plan-1:"))).toBe(
      true
    );
  });

  test("keeps every lesson small and every topic covered", () => {
    expect(
      lessons.every(
        (lesson) => lesson.estimatedMinutes > 0 && lesson.estimatedMinutes <= 45
      )
    ).toBe(true);
    const coveredRefs = new Set(
      lessons.flatMap((lesson) => lesson.syllabusRefs)
    );
    expect(coveredRefs.size).toBe(62);
    expect(lessons.every((lesson) => lesson.checkSpecs.length === 3)).toBe(
      true
    );
  });

  test("distributes the module weights across their lessons", () => {
    const totalWeight = lessons.reduce((sum, lesson) => sum + lesson.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 6);
  });

  test("keeps the tree attached to its parents", () => {
    const byId = new Map(plan.nodes.map((node) => [node.id, node]));
    for (const lesson of lessons) {
      expect(lesson.parentId).not.toBeNull();
      expect(byId.get(lesson.parentId ?? "")?.kind).toBe("topic");
    }
    for (const topic of topics) {
      expect(byId.get(topic.parentId ?? "")?.kind).toBe("module");
    }
    for (const module of modules) {
      expect(module.parentId).toBeNull();
    }
  });

  test("assigns a unique, stable order", () => {
    const orders = plan.nodes.map((node) => node.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect(orders).toEqual([...orders].sort((left, right) => left - right));
  });

  test("passes validation with the full template", () => {
    expect(
      plan.diagnostics.filter((item) => item.severity === "error")
    ).toEqual([]);
  });

  test("reports an over-budget plan when the available time is too small", () => {
    const budgeted = buildStudyPlanDraft({
      availableMinutes: 600,
      planId: "plan-1",
      template: systemArchitect2026Template,
    });

    expect(budgeted.diagnostics).toContainEqual(
      expect.objectContaining({ code: "over_time_budget", severity: "error" })
    );
  });
});
