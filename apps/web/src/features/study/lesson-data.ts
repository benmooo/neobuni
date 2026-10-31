import type {
  StudyLessonMaterial,
  StudyMaterialSection,
  StudyPaper,
  StudyPlanNode,
  StudySession,
} from "@neobuni/contracts";

const PAPER_LABELS: Record<StudyPaper, string> = {
  comprehensive: "综合知识",
  case: "案例分析",
  essay: "论文",
  shared: "共享",
};

type MaterialSectionKind =
  | "concept"
  | "exam"
  | "example"
  | "pitfall"
  | "mnemonic"
  | "prose";

const KEYWORD_MARKER = "关键词：";
const MAX_CONCEPTS = 4;
const MAX_CONCEPT_LENGTH = 24;
const SECTION_HEADING_HINTS: [string, MaterialSectionKind][] = [
  ["例题", "example"],
  ["思路", "example"],
  ["陷阱", "pitfall"],
  ["误区", "pitfall"],
  ["易错", "pitfall"],
  ["锚点", "mnemonic"],
  ["记忆", "mnemonic"],
  ["速记", "mnemonic"],
  ["怎么考", "exam"],
  ["考点", "exam"],
  ["考法", "exam"],
  ["概念", "concept"],
];

const clamp = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const splitOn = (value: string, pattern: RegExp) =>
  value
    .split(pattern)
    .map((part) => part.replace(/^[-•·*\s]+/, "").trim())
    .filter((part) => part.length > 0);

/** Longest-line text blocks read as a wall of prose, so cards split on lines. */
const splitSentences = (value: string | null | undefined): string[] => {
  if (!value) {
    return [];
  }
  return splitOn(value, /[\n。；;]+/);
};

const classifySection = (
  section: StudyMaterialSection
): MaterialSectionKind => {
  const hint = SECTION_HEADING_HINTS.find(([keyword]) =>
    section.heading.includes(keyword)
  );
  return hint ? hint[1] : "prose";
};

const sectionsOfKind = (
  material: StudyLessonMaterial | null | undefined,
  kind: MaterialSectionKind
) =>
  (material?.sections ?? []).filter(
    (section) => classifySection(section) === kind
  );

/**
 * Concept chips for the compact surfaces. The enrichment prompt returns one
 * concept per line; plan nodes only carry a "关键词：a、b、c。" tail.
 */
const splitConcepts = (node: StudyPlanNode): string[] => {
  const enriched = node.enrichment?.whatText ?? null;
  if (enriched) {
    const lines = splitOn(enriched, /\n+/);
    if (lines.length > 1) {
      return lines
        .slice(0, MAX_CONCEPTS)
        .map((line) => clamp(line, MAX_CONCEPT_LENGTH));
    }
  }
  const raw = node.whatText ?? node.objective ?? "";
  const markerIndex = raw.indexOf(KEYWORD_MARKER);
  const source =
    markerIndex >= 0 ? raw.slice(markerIndex + KEYWORD_MARKER.length) : raw;
  return splitOn(source.replace(/[。.]$/, ""), /[、,，]/)
    .slice(0, MAX_CONCEPTS)
    .map((concept) => clamp(concept, MAX_CONCEPT_LENGTH));
};

const findLessonNode = (
  nodes: StudyPlanNode[],
  planNodeId: string
): StudyPlanNode | null =>
  nodes.find((node) => node.id === planNodeId && node.kind === "lesson") ??
  null;

const findLessonSession = (
  sessions: StudySession[],
  planNodeId: string
): StudySession | null => {
  const forNode = sessions
    .filter((session) => session.planNodeId === planNodeId)
    .sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor));
  return (
    forNode.find((session) => session.status === "in_progress") ??
    forNode.find((session) => session.status === "planned") ??
    forNode.at(-1) ??
    null
  );
};

const isSessionOpen = (session: StudySession | null): boolean =>
  session?.status === "planned" || session?.status === "in_progress";

const formatLocalDateTime = (localDateTime: string): string => {
  const [date = "", time = ""] = localDateTime.split("T");
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)} ${time.slice(0, 5)}`;
};

const lessonStorageKey = (scope: string, goalId: string, planNodeId: string) =>
  `neobuni.study.${scope}:${goalId}:${planNodeId}`;

const readStoredValue = (key: string): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStoredValue = (key: string, value: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private-mode storage is best effort; losing the checkpoint is harmless.
  }
};

export type { MaterialSectionKind };
export {
  classifySection,
  findLessonNode,
  findLessonSession,
  formatLocalDateTime,
  isSessionOpen,
  lessonStorageKey,
  PAPER_LABELS,
  readStoredValue,
  sectionsOfKind,
  splitConcepts,
  splitSentences,
  writeStoredValue,
};
