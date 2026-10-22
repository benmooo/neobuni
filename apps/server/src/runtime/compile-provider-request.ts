import type { ProviderPromptPacket } from "@neobuni/contracts";

const previewText = (text: string, length = 160) =>
  text.length <= length ? text : `${text.slice(0, length)}...`;

const previewMaybeText = (text: string | null | undefined, length = 160) =>
  text && text.length > 0 ? previewText(text, length) : null;

const previewProviderMessages = (
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
  }>
) =>
  messages.slice(-6).map((message, index) => ({
    index: messages.length - Math.min(messages.length, 6) + index,
    role: message.role,
    contentLength: message.content.length,
    contentPreview: previewText(message.content, 240),
  }));

const buildProviderRequestInput = (input: {
  providerKey: string;
  modelKey: string;
  persistedMessages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
  }>;
  promptPacket: ProviderPromptPacket;
  toolNames: string[];
}) => ({
  providerKey: input.providerKey,
  modelKey: input.modelKey,
  messageCount: input.persistedMessages.length,
  latestUserMessagePreview: previewMaybeText(
    [...input.persistedMessages]
      .reverse()
      .find((message) => message.role === "user")?.content,
    240
  ),
  recentMessages: previewProviderMessages(input.persistedMessages),
  systemPromptLength: input.promptPacket.systemPrompt.length,
  systemPromptPreview: previewText(input.promptPacket.systemPrompt, 1200),
  promptSectionCount: input.promptPacket.sections.length,
  promptSections: input.promptPacket.sections.map((section, index) => ({
    index,
    key: section.key,
    title: section.title,
    bodyLength: section.body.length,
    bodyPreview: previewText(section.body, 240),
  })),
  compiledExpression: input.promptPacket.compiledExpression
    ? {
        text: {
          openingMode: input.promptPacket.compiledExpression.text.openingMode,
          bodyMode: input.promptPacket.compiledExpression.text.bodyMode,
          closingMode: input.promptPacket.compiledExpression.text.closingMode,
        },
        voice: {
          cadenceMode: input.promptPacket.compiledExpression.voice.cadenceMode,
          affectMode: input.promptPacket.compiledExpression.voice.affectMode,
          pauseDensity:
            input.promptPacket.compiledExpression.voice.pauseDensity,
        },
        ui: {
          messageFrame: input.promptPacket.compiledExpression.ui.messageFrame,
          ctaMode: input.promptPacket.compiledExpression.ui.ctaMode,
          alertStyle: input.promptPacket.compiledExpression.ui.alertStyle,
        },
      }
    : null,
  toolNames: input.toolNames,
});

export {
  buildProviderRequestInput,
  previewMaybeText,
  previewProviderMessages,
  previewText,
};
