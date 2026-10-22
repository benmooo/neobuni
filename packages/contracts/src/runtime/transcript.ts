import {
  modelMessagesToUIMessages,
  type ModelMessage,
} from "@tanstack/ai";
import { z } from "zod";

const transcriptVersionSchema = z.literal(1);
const persistedMessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
const uiTranscriptRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
  "tool",
  "reasoning",
]);

const uiTranscriptPartSchema = z
  .object({
    type: z.string().trim().min(1),
  })
  .passthrough();

const uiTranscriptMessageSchema = z.object({
  role: uiTranscriptRoleSchema,
  parts: z.array(uiTranscriptPartSchema).min(1),
});

const uiTranscriptSchema = z.object({
  version: transcriptVersionSchema,
  messages: z.array(uiTranscriptMessageSchema).min(1),
});

const transcriptEnvelopeSchema = z.object({
  ui: uiTranscriptSchema,
});

const hydratedUiMessageSchema = z
  .object({
    id: z.string().trim().min(1),
    role: uiTranscriptRoleSchema,
    parts: z.array(uiTranscriptPartSchema),
    metadata: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.date().optional(),
  })
  .passthrough();

const persistedMessageSchema = z.object({
  id: z.string().trim().min(1),
  role: persistedMessageRoleSchema,
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
});

type TranscriptEnvelope = z.infer<typeof transcriptEnvelopeSchema>;
type UiTranscript = z.infer<typeof uiTranscriptSchema>;
type UiTranscriptMessage = z.infer<typeof uiTranscriptMessageSchema>;
type HydratedUiMessage = z.infer<typeof hydratedUiMessageSchema>;
type PersistedMessage = z.infer<typeof persistedMessageSchema>;

const TRANSCRIPT_VERSION = 1 as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseWithSchema = <T>(
  schema: z.ZodType<T>,
  value: unknown,
): T | null => {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
};

const serializeUiTranscript = (
  messages: ReadonlyArray<ModelMessage>,
): UiTranscript | null => {
  const storedMessages = modelMessagesToUIMessages([...messages])
    .flatMap((message) => {
      const parsed = uiTranscriptMessageSchema.safeParse({
        role: message.role,
        parts: message.parts.map((part) => ({ ...part })),
      });

      return parsed.success ? [parsed.data] : [];
    });

  if (storedMessages.length === 0) {
    return null;
  }

  return {
    version: TRANSCRIPT_VERSION,
    messages: storedMessages,
  };
};

const serializeTranscriptEnvelope = (
  messages: ReadonlyArray<ModelMessage>,
): TranscriptEnvelope | null => {
  const ui = serializeUiTranscript(messages);

  return ui
    ? {
        ui,
      }
    : null;
};

const readUiTranscript = (
  persistedMessage: PersistedMessage,
): UiTranscript | null =>
  parseWithSchema(
    uiTranscriptSchema,
    isRecord(persistedMessage.metadata?.transcript)
    && isRecord(persistedMessage.metadata.transcript.ui)
      ? persistedMessage.metadata.transcript.ui
      : null,
  );

const normalizePersistedMessages = (
  messages: PersistedMessage[],
): ModelMessage[] =>
  messages.flatMap((message) =>
    message.role === "system"
      ? []
      : [{
          role: message.role,
          content: message.content,
        } satisfies ModelMessage],
  );

const toCreatedAtDate = (
  createdAt: PersistedMessage["createdAt"],
): Date | undefined => {
  if (createdAt instanceof Date) {
    return createdAt;
  }

  return typeof createdAt === "string" ? new Date(createdAt) : undefined;
};

const omitRenderMetadata = (metadata: Record<string, unknown>) => {
  if (!("render" in metadata)) {
    return metadata;
  }

  const { render: _render, ...rest } = metadata;
  return rest;
};

const toHydratedUiMessageId = (
  message: PersistedMessage,
  index: number,
  total: number,
) => (index === total - 1 ? message.id : `${message.id}:transcript:${index}`);

const toFallbackUiTranscriptMessage = (
  message: PersistedMessage,
): UiTranscriptMessage => ({
  role: message.role,
  parts: [{
    type: "text",
    content: message.content,
  }],
});

const expandPersistedMessagesToHydratedUiMessages = (
  messages: PersistedMessage[],
): HydratedUiMessage[] =>
  messages.flatMap((message) => {
    const transcriptMessages =
      readUiTranscript(message)?.messages ?? [toFallbackUiTranscriptMessage(message)];
    const createdAt = toCreatedAtDate(message.createdAt);

    return transcriptMessages.map((transcriptMessage, index) => {
      const isFinalTranscriptMessage = index === transcriptMessages.length - 1;
      const metadata = message.metadata ?? {};
      const hydratedMetadata = isFinalTranscriptMessage
        ? metadata
        : omitRenderMetadata(metadata);

      return {
        id: toHydratedUiMessageId(message, index, transcriptMessages.length),
        role: transcriptMessage.role,
        parts: transcriptMessage.parts,
        ...(Object.keys(hydratedMetadata).length > 0
          ? { metadata: hydratedMetadata }
          : {}),
        ...(createdAt ? { createdAt } : {}),
      };
    });
  });

export {
  expandPersistedMessagesToHydratedUiMessages,
  hydratedUiMessageSchema,
  normalizePersistedMessages,
  persistedMessageSchema,
  readUiTranscript,
  serializeTranscriptEnvelope,
  serializeUiTranscript,
  transcriptEnvelopeSchema,
  uiTranscriptMessageSchema,
  uiTranscriptSchema,
};

export type {
  HydratedUiMessage,
  PersistedMessage,
  TranscriptEnvelope,
  UiTranscript,
  UiTranscriptMessage,
};
