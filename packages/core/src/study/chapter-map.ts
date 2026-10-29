import chaptersJson from "./templates/system-architect-2026-chapters.json";

interface TextbookChapterMap {
  source: string;
  topics: Record<string, { chapters: number[]; title: string }>;
}

const chapterMap = chaptersJson as TextbookChapterMap;

/**
 * Chapters of the official textbook that cover a syllabus topic. Empty when the
 * topic has no chapter of its own (mock exams, answer templates), so lesson
 * material is not grounded in irrelevant pages.
 */
const textbookChaptersForTopic = (topicId: string): number[] =>
  chapterMap.topics[topicId]?.chapters ?? [];

const textbookSourceTitle = (): string => chapterMap.source;

const textbookChaptersForTopics = (topicIds: string[]): number[] => [
  ...new Set(topicIds.flatMap((topicId) => textbookChaptersForTopic(topicId))),
];

export {
  textbookChaptersForTopic,
  textbookChaptersForTopics,
  textbookSourceTitle,
};
