import { extractMemoryKeywords } from "./memory-gate";

interface GraphProjectableMemory {
  content: string;
  id: string;
  keywords: string[];
  type: "event" | "thought" | "preference" | "fact" | "task";
}

const unique = <T>(values: T[]) => Array.from(new Set(values));

const inferPrimaryNodeKind = (
  type: GraphProjectableMemory["type"]
): "topic" | "event" | "task" => {
  if (type === "task") {
    return "task";
  }

  if (type === "event") {
    return "event";
  }

  return "topic";
};

const inferPrimaryRelationType = (type: GraphProjectableMemory["type"]) => {
  if (type === "preference") {
    return "prefers";
  }

  if (type === "fact") {
    return "states";
  }

  return "about";
};

const buildGraphProjectionTerms = (memory: GraphProjectableMemory) =>
  unique([
    ...memory.keywords.map((keyword) => keyword.trim().toLowerCase()),
    ...extractMemoryKeywords(memory.content),
  ])
    .filter((term) => term.length > 1)
    .slice(0, 6);

export type { GraphProjectableMemory };
export {
  buildGraphProjectionTerms,
  inferPrimaryNodeKind,
  inferPrimaryRelationType,
};
