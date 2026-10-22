import type { AppendMessage } from "@assistant-ui/react";
import {
	AssistantRuntimeProvider,
	useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { UIMessage } from "@tanstack/ai-react";
import { type ReactNode, useMemo } from "react";

import {
	convertUiMessageToThreadMessageLike,
	groupConsecutiveToolOnlyUiMessages,
} from "@/lib/assistant-ui/convert-ui-message-to-thread-message-like";

type Props = {
	children: ReactNode;
	isLoading: boolean;
	messages: UIMessage[];
	onSend: (content: string) => Promise<void>;
	onStop: () => void;
};

const getAppendMessageText = (message: AppendMessage) =>
	message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();

function AssistantUiRuntimeProvider({
	children,
	isLoading,
	messages,
	onSend,
	onStop,
}: Props) {
	const displayMessages = useMemo(
		() => groupConsecutiveToolOnlyUiMessages(messages),
		[messages]
	);

	const runtime = useExternalStoreRuntime({
		isRunning: isLoading,
		messages: displayMessages,
		convertMessage: convertUiMessageToThreadMessageLike,
		onNew: async (message) => {
			const content = getAppendMessageText(message);

			if (content.length === 0) {
				return;
			}

			await onSend(content);
		},
		onCancel: async () => {
			onStop();
		},
	});

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			{children}
		</AssistantRuntimeProvider>
	);
}

export { AssistantUiRuntimeProvider };
