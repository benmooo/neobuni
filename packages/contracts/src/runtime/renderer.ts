import { z } from "zod";

const voiceStylePresetSchema = z.enum([
  "calm_grounded",
  "warm_supportive",
  "clear_guiding",
]);

const voiceBoundaryModeSchema = z.enum([
  "soft",
  "steady",
]);

const voiceRenderSpecSchema = z.object({
  channel: z.literal("voice"),
  stylePreset: voiceStylePresetSchema,
  speakingRate: z.number().min(0.85).max(1.1),
  pauseMs: z.number().int().min(120).max(600),
  boundaryMode: voiceBoundaryModeSchema,
  repairPreface: z.string().trim().min(1).nullable(),
});

const uiBubbleVariantSchema = z.enum([
  "default",
  "support",
  "reflection",
  "plan",
]);

const uiAlertToneSchema = z.enum([
  "none",
  "gentle",
  "protective",
]);

const uiSuggestedActionSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(48),
  prompt: z.string().trim().min(1).max(200),
});

const uiRenderSpecSchema = z.object({
  channel: z.literal("ui"),
  bubbleVariant: uiBubbleVariantSchema,
  alertTone: uiAlertToneSchema,
  alertTitle: z.string().trim().min(1).nullable(),
  alertBody: z.string().trim().min(1).nullable(),
  composerPlaceholder: z.string().trim().min(1).max(120),
  suggestedActions: z.array(uiSuggestedActionSchema).max(3),
});

const rendererStateSchema = z.object({
  voice: voiceRenderSpecSchema,
  ui: uiRenderSpecSchema,
});

export {
  rendererStateSchema,
  uiAlertToneSchema,
  uiBubbleVariantSchema,
  uiRenderSpecSchema,
  uiSuggestedActionSchema,
  voiceBoundaryModeSchema,
  voiceRenderSpecSchema,
  voiceStylePresetSchema,
};

export type RendererState = z.infer<typeof rendererStateSchema>;
export type UiAlertTone = z.infer<typeof uiAlertToneSchema>;
export type UiBubbleVariant = z.infer<typeof uiBubbleVariantSchema>;
export type UiRenderSpec = z.infer<typeof uiRenderSpecSchema>;
export type UiSuggestedAction = z.infer<typeof uiSuggestedActionSchema>;
export type VoiceBoundaryMode = z.infer<typeof voiceBoundaryModeSchema>;
export type VoiceRenderSpec = z.infer<typeof voiceRenderSpecSchema>;
export type VoiceStylePreset = z.infer<typeof voiceStylePresetSchema>;
