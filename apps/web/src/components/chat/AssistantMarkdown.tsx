import { Streamdown } from "streamdown";

import {
  assistantMarkdownAnimated,
  assistantMarkdownClassName,
  assistantMarkdownControls,
  assistantMarkdownLinkSafety,
  assistantMarkdownPlugins,
  assistantMarkdownTranslations,
  getAssistantMarkdownRenderState,
  isEmptyAssistantMarkdownContent,
  normalizeAssistantMarkdownContent,
} from "./assistant-markdown-config";

interface Props {
  activeAssistantMessageId: string | null;
  content: string;
  isLoading: boolean;
  messageId: string;
}

function AssistantMarkdown({
  activeAssistantMessageId,
  content,
  isLoading,
  messageId,
}: Props) {
  if (isEmptyAssistantMarkdownContent(content)) {
    return null;
  }

  const renderState = getAssistantMarkdownRenderState({
    activeAssistantMessageId,
    isLoading,
    messageId,
  });

  return (
    <Streamdown
      animated={assistantMarkdownAnimated}
      caret="block"
      className={assistantMarkdownClassName}
      controls={assistantMarkdownControls}
      isAnimating={renderState.isAnimating}
      lineNumbers={false}
      linkSafety={assistantMarkdownLinkSafety}
      mode={renderState.mode}
      normalizeHtmlIndentation
      plugins={assistantMarkdownPlugins}
      translations={assistantMarkdownTranslations}
    >
      {normalizeAssistantMarkdownContent(content)}
    </Streamdown>
  );
}

export { AssistantMarkdown };
