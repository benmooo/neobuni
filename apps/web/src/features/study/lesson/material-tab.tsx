import type { StudyLessonMaterial } from "@neobuni/contracts";
import { Button } from "@neobuni/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@neobuni/ui/components/sheet";
import { Spinner } from "@neobuni/ui/components/spinner";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CaretDown,
  Quotes,
  Warning,
} from "@phosphor-icons/react";
import { useState } from "react";

import {
  classifySection,
  readStoredValue,
  splitSentences,
  writeStoredValue,
} from "../lesson-data";
import { DOT, EYEBROW, META, PROSE } from "./styles";

interface Props {
  isGenerating: boolean;
  material: StudyLessonMaterial | null;
  onGenerate: () => void;
  storageKey: string;
  title: string;
}

const Paragraph = ({ children }: { children: string }) => (
  <p className={`${PROSE} whitespace-pre-line`}>{children}</p>
);

const Callout = ({ children }: { children: string }) => (
  <p
    className={`${PROSE} whitespace-pre-line border-primary border-l-2 bg-primary/5 py-2 pr-2 pl-3`}
  >
    {children}
  </p>
);

const NumberedList = ({ lines }: { lines: string[] }) => (
  <ol className="space-y-2.5">
    {lines.map((line, index) => (
      <li className="flex gap-2.5" key={`${index}-${line.slice(0, 8)}`}>
        <span className="mt-1 grid size-4 shrink-0 place-items-center border border-primary/40 font-heading text-[0.625rem] text-primary tabular-nums">
          {index + 1}
        </span>
        <span className={PROSE}>{line}</span>
      </li>
    ))}
  </ol>
);

const PitfallList = ({ lines }: { lines: string[] }) => (
  <ul className="space-y-2.5">
    {lines.map((line) => (
      <li
        className="flex gap-2 border-destructive/40 border-l-2 pl-2.5"
        key={line.slice(0, 12)}
      >
        <Warning className="mt-1 size-3.5 shrink-0 text-destructive" />
        <span className={PROSE}>{line}</span>
      </li>
    ))}
  </ul>
);

const AnchorTiles = ({ lines }: { lines: string[] }) => (
  <div className="grid gap-2 sm:grid-cols-2">
    {lines.map((line) => (
      <p
        className="border border-border px-2.5 py-2 font-heading text-sm leading-snug"
        key={line.slice(0, 12)}
      >
        {line}
      </p>
    ))}
  </div>
);

const SectionBody = ({ body, heading }: { body: string; heading: string }) => {
  const kind = classifySection({ body, heading });
  const lines = splitSentences(body);
  if (kind === "example" && lines.length > 1) {
    return <NumberedList lines={lines} />;
  }
  if (kind === "pitfall" && lines.length > 0) {
    return <PitfallList lines={lines} />;
  }
  if (kind === "mnemonic" && lines.length > 0) {
    return <AnchorTiles lines={lines} />;
  }
  if (kind === "exam") {
    return <Callout>{body}</Callout>;
  }
  return <Paragraph>{body}</Paragraph>;
};

/** One section at a time: prose walls are what made the old page unreadable. */
export function MaterialTab({
  isGenerating,
  material,
  onGenerate,
  storageKey,
  title,
}: Props) {
  const sections = material?.sections ?? [];
  const storedIndex = Number(readStoredValue(storageKey) ?? "0");
  const [index, setIndex] = useState(() =>
    Number.isFinite(storedIndex) && storedIndex < sections.length
      ? storedIndex
      : 0
  );
  const section = sections[index];

  const move = (next: number) => {
    setIndex(next);
    writeStoredValue(storageKey, String(next));
  };

  if (!section) {
    return (
      <div className="flex flex-col items-start gap-3 border border-border border-dashed px-4 py-6">
        <BookOpenText className="size-5 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-heading text-sm">这一节还没有教材内容</p>
          <p className={`${PROSE} text-muted-foreground`}>
            生成后会有「概念讲解 / 怎么考 / 例题与思路 / 常见陷阱 /
            记忆锚点」，可以分段精读。
          </p>
        </div>
        <Button disabled={isGenerating} onClick={onGenerate} size="lg">
          {isGenerating ? (
            <>
              <Spinner className="size-4" />
              生成中…
            </>
          ) : (
            "生成教材内容"
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span className={EYEBROW}>精读</span>
        <div className="flex flex-1 items-center gap-1">
          {sections.map((item, dotIndex) => (
            <button
              aria-label={`第 ${dotIndex + 1} 段：${item.heading}`}
              className={`h-0.5 flex-1 transition-colors ${dotIndex === index ? "bg-primary" : "bg-border"}`}
              key={item.heading}
              onClick={() => move(dotIndex)}
              type="button"
            />
          ))}
        </div>
        <span className={META}>
          {index + 1} / {sections.length}
        </span>
        {material && material.excerpts.length > 0 ? (
          <Sheet>
            <SheetTrigger
              render={
                <Button size="xs" variant="ghost">
                  <Quotes className="size-3" />
                  原文 {material.excerpts.length}
                </Button>
              }
            />
            <SheetContent className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>教材原文摘录</SheetTitle>
                <SheetDescription>
                  {title} · 来自教材检索的原文片段
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                {material.excerpts.map((excerpt) => (
                  <div
                    className="space-y-1 border-border border-l-2 pl-2.5"
                    key={`${excerpt.chapter}-${excerpt.locator}-${excerpt.text.slice(0, 8)}`}
                  >
                    <p className="flex items-baseline gap-1.5 font-heading text-[0.6875rem]">
                      {excerpt.chapter}
                      <span className={META}>{excerpt.locator}</span>
                    </p>
                    <p className="whitespace-pre-line text-muted-foreground text-sm leading-6">
                      {excerpt.text}
                    </p>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>

      <div aria-label={section.heading} className="space-y-4" role="tabpanel">
        <h3 className="font-heading text-xl leading-snug">{section.heading}</h3>
        <div className="max-w-prose">
          <SectionBody body={section.body} heading={section.heading} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button
          disabled={index === 0}
          onClick={() => move(index - 1)}
          size="lg"
          variant="outline"
        >
          <ArrowLeft className="size-3.5" />
          上一段
        </Button>
        <span className={`${META} hidden sm:inline`}>{section.heading}</span>
        <Button
          disabled={index >= sections.length - 1}
          onClick={() => move(index + 1)}
          size="lg"
          variant="outline"
        >
          下一段
          <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** 速记: mnemonic anchors and pitfalls, without re-reading the prose. */
export function AnchorsTab({
  material,
}: {
  material: StudyLessonMaterial | null;
}) {
  const anchors = (material?.sections ?? []).filter(
    (section) => classifySection(section) === "mnemonic"
  );
  const pitfalls = (material?.sections ?? []).filter(
    (section) => classifySection(section) === "pitfall"
  );
  const [revealed, setRevealed] = useState(false);

  if (!(material && (anchors.length > 0 || pitfalls.length > 0))) {
    return (
      <p className="border border-border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
        生成教材内容后，这里会列出记忆锚点和易错点。
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {anchors.map((section) => (
        <div className="space-y-3" key={section.heading}>
          <div className="flex items-center justify-between gap-2">
            <span className={EYEBROW}>记忆锚点</span>
            <Button
              onClick={() => setRevealed((value) => !value)}
              size="xs"
              variant="ghost"
            >
              <CaretDown
                className={`size-3 transition-transform ${revealed ? "rotate-180" : ""}`}
              />
              {revealed ? "收起" : "先自测再看"}
            </Button>
          </div>
          {revealed ? (
            <AnchorTiles lines={splitSentences(section.body)} />
          ) : (
            <p className="border border-border border-dashed px-3 py-8 text-center text-muted-foreground text-sm">
              先在脑子里过一遍：这一节最关键的 3 个锚点是什么？
            </p>
          )}
        </div>
      ))}
      {pitfalls.map((section) => (
        <div className="space-y-3" key={section.heading}>
          <span className={EYEBROW}>常见陷阱</span>
          <PitfallList lines={splitSentences(section.body)} />
        </div>
      ))}
      <p className="flex items-start gap-1.5 border-t pt-3 text-muted-foreground text-xs">
        <span className={DOT}>·</span>
        合上讲义，把上面的锚点默写一遍，比再读一遍有用。
      </p>
    </div>
  );
}
