import type { RendererState, UiRenderSpec } from "@neobuni/contracts";
import type { UIMessage } from "@tanstack/ai-react";

interface MetadataCarrier {
  metadata?: Record<string, unknown>;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getMessageMetadata = (message: UIMessage) =>
  (message as UIMessage & MetadataCarrier).metadata ?? {};

const getMessageRendererState = (message: UIMessage): RendererState | null => {
  const metadata = getMessageMetadata(message);
  const render = asRecord(metadata.render);

  if (!render) {
    return null;
  }

  const voice = asRecord(render.voice);
  const ui = asRecord(render.ui);

  if (!(voice && ui)) {
    return null;
  }

  return render as RendererState;
};

const getMessageUiRenderSpec = (message: UIMessage): UiRenderSpec | null =>
  getMessageRendererState(message)?.ui ?? null;

const getLatestAssistantUiRenderSpec = (
  messages: UIMessage[]
): UiRenderSpec | null => {
  const latestAssistantMessage = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" && getMessageUiRenderSpec(message) !== null
    );

  return latestAssistantMessage
    ? getMessageUiRenderSpec(latestAssistantMessage)
    : null;
};

export {
  getLatestAssistantUiRenderSpec,
  getMessageRendererState,
  getMessageUiRenderSpec,
};
