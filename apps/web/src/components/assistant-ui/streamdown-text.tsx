import { type TextMessagePartProps, useAuiState } from "@assistant-ui/react";
import { Streamdown } from "streamdown";

import {
	assistantMarkdownAnimated,
	assistantMarkdownClassName,
	assistantMarkdownControls,
	assistantMarkdownLinkSafety,
	assistantMarkdownPlugins,
	assistantMarkdownTranslations,
	normalizeAssistantMarkdownContent,
} from "@/components/chat/assistant-markdown-config";

function AssistantStreamdownText({ text }: TextMessagePartProps) {
	const normalizedContent = normalizeAssistantMarkdownContent(text);
	const isStreaming = useAuiState(
		(state) =>
			state.thread.isRunning &&
			state.message.role === "assistant" &&
			state.message.id === state.thread.messages.at(-1)?.id
	);

	if (normalizedContent.length === 0) {
		return null;
	}

	return (
		<Streamdown
			animated={assistantMarkdownAnimated}
			caret="block"
			className={assistantMarkdownClassName}
			controls={assistantMarkdownControls}
			isAnimating={isStreaming}
			lineNumbers={false}
			linkSafety={assistantMarkdownLinkSafety}
			mode={isStreaming ? "streaming" : "static"}
			normalizeHtmlIndentation
			plugins={assistantMarkdownPlugins}
			translations={assistantMarkdownTranslations}
		>
			{normalizedContent}
		</Streamdown>
	);
}

export { AssistantStreamdownText };
