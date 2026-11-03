const LOCATOR_PATTERN = /^【(.+?) · p\.(\d+)(?:-(\d+))?】$/;

interface ChunkLocator {
  chapter: string;
  locator: string;
  page: number;
  pageEnd: number | null;
}

/**
 * Ingested textbook chunks start with a locator line
 * (`【第13章 层次式架构设计理论与实践 · p.459-461】`), which is how page and
 * chapter survive chunking without extra columns.
 */
const parseChunkLocator = (content: string): ChunkLocator | null => {
  const [firstLine, ...rest] = content.split("\n");
  const match = LOCATOR_PATTERN.exec((firstLine ?? "").trim());

  if (!match || rest.length === 0) {
    return null;
  }

  const page = Number(match[2]);
  const pageEnd = match[3] ? Number(match[3]) : null;

  if (!Number.isFinite(page) || page <= 0) {
    return null;
  }

  return {
    chapter: (match[1] ?? "").trim(),
    locator: (firstLine ?? "").trim(),
    page,
    pageEnd: pageEnd !== null && pageEnd > page ? pageEnd : null,
  };
};

export type { ChunkLocator };
export { parseChunkLocator };
