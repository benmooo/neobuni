/**
 * Ingest a text-based PDF textbook into the knowledge base, keeping page and
 * chapter locators so lessons can cite real positions.
 *
 * Legacy Chinese PDFs use CID fonts without a ToUnicode map, so extraction only
 * works when pdf.js is given the cMap tables from `pdfjs-dist/cmaps`.
 *
 * Usage:
 *   DATABASE_URL=file:/abs/path/.data/local.db \
 *   PROFILE_ID=... \
 *   bun run apps/server/scripts/ingest-textbook.ts ~/Downloads/book.pdf
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import { extractMemoryKeywords } from "@neobuni/core";
import {
  createKnowledgeChunk,
  createKnowledgeDocument,
  findKnowledgeDocumentByChecksum,
  runRepo,
  upsertKnowledgeChunkFts,
} from "@neobuni/db";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_CHARS = 1200;
const OVERLAP_CHARS = 150;

// `pdfjs-dist` resolves to its entry file, so the cMap/standard-font tables live
// at the package root. Getting this wrong silently extracts Latin text only.
const pdfjsRoot = dirname(
  createRequire(import.meta.url).resolve("pdfjs-dist/package.json")
);

const normalizePageText = (raw: string): string =>
  raw
    // pdf.js emits one item per glyph run, so CJK words arrive space-separated.
    .replace(/\s+/g, " ")
    .replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "")
    .replace(/\s+([，。；：、）】」])/g, "$1")
    .trim();

const readChapterIndex = async (doc: pdfjs.PDFDocumentProxy) => {
  const outline = await doc.getOutline().catch(() => null);
  const entries: { page: number; title: string }[] = [];

  for (const item of outline ?? []) {
    const title = String((item as { title?: string }).title ?? "").trim();
    if (!/^第\d+章/.test(title)) {
      continue;
    }

    let dest: string | unknown[] | null | undefined = (
      item as { dest?: string | unknown[] }
    ).dest;
    if (typeof dest === "string") {
      dest = await doc.getDestination(dest).catch(() => null);
    }
    const ref = Array.isArray(dest) ? dest[0] : null;
    const pageIndex = ref
      ? await doc.getPageIndex(ref as never).catch(() => null)
      : null;

    if (pageIndex !== null) {
      entries.push({ page: pageIndex + 1, title });
    }
  }

  return entries.sort((a, b) => a.page - b.page);
};

const chapterOf = (
  chapters: { page: number; title: string }[],
  page: number
): string => {
  let current = "前言/目录";
  for (const chapter of chapters) {
    if (chapter.page <= page) {
      current = chapter.title;
    }
  }
  return current;
};

const buildChunks = (
  pages: { page: number; text: string }[],
  chapters: { page: number; title: string }[]
) => {
  const chunks: { content: string; locator: string }[] = [];
  let buffer = "";
  let startPage = 0;
  let endPage = 0;

  const flush = () => {
    const content = buffer.trim();
    if (content.length < 80) {
      buffer = "";
      return;
    }

    const locator = `${chapterOf(chapters, startPage)} · p.${startPage}${endPage > startPage ? `-${endPage}` : ""}`;
    chunks.push({ content: `【${locator}】\n${content}`, locator });
    buffer = content.slice(-OVERLAP_CHARS);
  };

  for (const page of pages) {
    if (page.text.length === 0) {
      continue;
    }

    if (buffer.length === 0) {
      startPage = page.page;
    }
    endPage = page.page;

    buffer = buffer.length === 0 ? page.text : `${buffer}\n${page.text}`;

    while (buffer.length > MAX_CHARS) {
      const slice = buffer.slice(0, MAX_CHARS);
      const cut = Math.max(
        slice.lastIndexOf("。"),
        slice.lastIndexOf("！"),
        slice.lastIndexOf("？")
      );
      const take = cut > MAX_CHARS * 0.6 ? cut + 1 : MAX_CHARS;
      const head = buffer.slice(0, take).trim();
      const locator = `${chapterOf(chapters, startPage)} · p.${startPage}${endPage > startPage ? `-${endPage}` : ""}`;

      if (head.length >= 80) {
        chunks.push({ content: `【${locator}】\n${head}`, locator });
      }
      buffer = buffer.slice(take).trimStart();
      startPage = page.page;
    }
  }

  flush();
  return chunks;
};

const main = async () => {
  const filePath = resolve(process.argv[2] ?? "");
  const profileId = process.env.PROFILE_ID ?? "";
  const title = process.env.DOC_TITLE ?? "系统架构设计师教程（第2版）";

  if (!(filePath && profileId)) {
    throw new Error(
      "usage: PROFILE_ID=... bun run ingest-textbook.ts <file.pdf>"
    );
  }

  const data = new Uint8Array(await readFile(filePath));
  const doc = await pdfjs.getDocument({
    cMapPacked: true,
    cMapUrl: `${pdfjsRoot}/cmaps/`,
    data,
    standardFontDataUrl: `${pdfjsRoot}/standard_fonts/`,
  }).promise;

  console.log(`pdf: ${doc.numPages} pages`);

  const chapters = await readChapterIndex(doc);
  console.log(`chapters: ${chapters.length}`);
  for (const chapter of chapters.slice(0, 5)) {
    console.log(`  - ${chapter.title} @ p.${chapter.page}`);
  }

  const pages: { page: number; text: string }[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const raw = content.items
      .map((item) => (item as { str?: string }).str ?? "")
      .join("");
    pages.push({ page: pageNumber, text: normalizePageText(raw) });
    if (pageNumber % 100 === 0) {
      console.log(`  extracted ${pageNumber}/${doc.numPages}`);
    }
  }

  const chunks = buildChunks(pages, chapters);
  const totalChars = pages.reduce((sum, page) => sum + page.text.length, 0);
  console.log(`text: ${totalChars} chars, chunks: ${chunks.length}`);

  const checksum = createHash("sha256")
    .update(`${title}\n${doc.numPages}\n${totalChars}`)
    .digest("hex");
  const existing = await runRepo(
    findKnowledgeDocumentByChecksum({ checksum, profileId })
  );
  if (existing) {
    console.log(`already ingested: ${existing.id}`);
    return;
  }

  const document = await runRepo(
    createKnowledgeDocument({
      checksum,
      profileId,
      scope: "profile",
      sourceType: "pdf",
      sourceUri: filePath,
      title,
      trustLevel: "curated",
    })
  );

  let index = 0;
  for (const chunk of chunks) {
    const keywords = [...new Set(extractMemoryKeywords(chunk.content))].slice(
      0,
      8
    );
    const created = await runRepo(
      createKnowledgeChunk({
        chunkIndex: index,
        content: chunk.content,
        documentId: document.id,
        keywords,
        tokenCount: Math.ceil(chunk.content.length / 2),
      })
    );
    await runRepo(
      upsertKnowledgeChunkFts({
        chunkId: created.id,
        content: created.content,
        keywords: created.keywords,
      })
    );
    index += 1;
    if (index % 100 === 0) {
      console.log(`  stored ${index}/${chunks.length}`);
    }
  }

  console.log(`done: document ${document.id}, ${chunks.length} chunks`);
};

await main();
