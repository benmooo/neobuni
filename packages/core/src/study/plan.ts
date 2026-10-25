import type { StudyPaper, StudyPlanNode } from "@neobuni/contracts";

const listStudyLessons = (nodes: StudyPlanNode[]): StudyPlanNode[] =>
  nodes
    .filter((node) => node.kind === "lesson")
    .sort((left, right) => left.order - right.order);

const listStudyLessonsForPaper = (
  nodes: StudyPlanNode[],
  paper: StudyPaper
): StudyPlanNode[] =>
  listStudyLessons(nodes).filter(
    (node) => node.paper === paper || node.paper === "shared"
  );

const hasPrerequisiteCycle = (nodes: StudyPlanNode[]): boolean => {
  const lessons = listStudyLessons(nodes);
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): boolean => {
    if (visited.has(id)) {
      return false;
    }
    if (visiting.has(id)) {
      return true;
    }
    visiting.add(id);
    const lesson = byId.get(id);
    for (const prerequisite of lesson?.prerequisites ?? []) {
      if (byId.has(prerequisite) && visit(prerequisite)) {
        return true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  return lessons.some((lesson) => visit(lesson.id));
};

const orderStudyLessons = (nodes: StudyPlanNode[]): StudyPlanNode[] => {
  const lessons = listStudyLessons(nodes);
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const ordered: StudyPlanNode[] = [];
  const placed = new Set<string>();

  while (ordered.length < lessons.length) {
    const ready = lessons.filter(
      (lesson) =>
        !placed.has(lesson.id) &&
        lesson.prerequisites.every(
          (prerequisite) => !byId.has(prerequisite) || placed.has(prerequisite)
        )
    );

    if (ready.length === 0) {
      // A cycle or an unknown prerequisite: keep the remaining lessons in
      // stable order so the scheduler can still surface diagnostics.
      ordered.push(...lessons.filter((lesson) => !placed.has(lesson.id)));
      break;
    }

    for (const lesson of ready) {
      ordered.push(lesson);
      placed.add(lesson.id);
    }
  }

  return ordered;
};

const totalStudyMinutes = (nodes: StudyPlanNode[]): number =>
  listStudyLessons(nodes).reduce(
    (sum, lesson) => sum + lesson.estimatedMinutes,
    0
  );

const studyWeightTotal = (nodes: StudyPlanNode[]): number =>
  listStudyLessons(nodes).reduce((sum, lesson) => sum + lesson.weight, 0);

export {
  hasPrerequisiteCycle,
  listStudyLessons,
  listStudyLessonsForPaper,
  orderStudyLessons,
  studyWeightTotal,
  totalStudyMinutes,
};
