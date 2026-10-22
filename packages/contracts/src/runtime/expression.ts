import { z } from "zod";

import { workingMemoryFocusSchema } from "../cognition-layer/memory-system";
import { stanceSchema } from "../core-layer/soul";
import { responseSpecSchema, responseToolPolicySchema } from "./response";

const expressionChannelSchema = z.enum(["text", "voice", "ui"]);

const expressionSignalStrengthBandSchema = z.enum(["weak", "medium", "strong"]);

const expressionSignalConsumptionModeSchema = z.enum([
  "observe",
  "context_hint",
  "decision_input",
]);

const expressionSignalDriverSchema = z.object({
  kind: z.string().trim().min(1),
  score: z.number().min(0).max(1),
  strengthBand: expressionSignalStrengthBandSchema,
  consumptionMode: expressionSignalConsumptionModeSchema,
});

const expressionContextSchema = z.object({
  userIntent: z
    .enum(["support", "reflection", "planning", "connection"])
    .nullable(),
  emotionalLoad: z.enum(["low", "medium", "high"]),
  vulnerability: z.enum(["low", "medium", "high"]),
  protectiveLevel: z.number().int().min(0).max(3),
  primaryStance: stanceSchema,
  workingMemoryFocus: workingMemoryFocusSchema,
});

const expressionCompilerInputBaseSchema = z.object({
  responseSpec: responseSpecSchema,
  context: expressionContextSchema,
  signalDrivers: z.array(expressionSignalDriverSchema).max(5),
});

const textExpressionCompilerInputSchema =
  expressionCompilerInputBaseSchema.extend({
    channel: z.literal("text"),
  });

const voiceExpressionCompilerInputSchema =
  expressionCompilerInputBaseSchema.extend({
    channel: z.literal("voice"),
  });

const uiExpressionCompilerInputSchema =
  expressionCompilerInputBaseSchema.extend({
    channel: z.literal("ui"),
  });

const textOpeningModeSchema = z.enum([
  "grounding_first",
  "empathetic_first",
  "direct_answer_first",
  "check_in_first",
]);

const textBodyModeSchema = z.enum(["concise", "balanced", "layered"]);

const textClosingModeSchema = z.enum([
  "soft_open",
  "explicit_followup",
  "gentle_handoff",
  "supportive_close",
]);

const textFollowupModeSchema = z.enum([
  "none",
  "gentle_question",
  "check_state_first",
]);

const textSuggestionModeSchema = z.enum(["none", "tentative", "direct"]);

const textToolUseModeSchema = z.enum([
  "avoid",
  "available_if_needed",
  "proactively_offer",
]);

const compiledTextExpressionSchema = z.object({
  channel: z.literal("text"),
  openingMode: textOpeningModeSchema,
  bodyMode: textBodyModeSchema,
  closingMode: textClosingModeSchema,
  followupMode: textFollowupModeSchema,
  suggestionMode: textSuggestionModeSchema,
  toolUseMode: textToolUseModeSchema,
  toolPolicy: responseToolPolicySchema,
  toneDirectives: z.array(z.string().trim().min(1)),
  forbiddenMoves: z.array(z.string().trim().min(1)),
  renderHints: z.array(z.string().trim().min(1)),
});

const voiceCadenceModeSchema = z.enum([
  "slow_grounded",
  "steady_warm",
  "clear_brisk",
]);

const voiceAffectModeSchema = z.enum([
  "soothing",
  "warm_neutral",
  "light_encouraging",
]);

const voicePauseDensitySchema = z.enum(["sparse", "balanced", "supportive"]);

const voiceEmphasisBudgetSchema = z.enum(["low", "medium"]);

const voiceRepairModeSchema = z.enum([
  "none",
  "gentle_reassurance",
  "confirm_then_continue",
]);

const compiledVoiceExpressionSchema = z.object({
  channel: z.literal("voice"),
  cadenceMode: voiceCadenceModeSchema,
  affectMode: voiceAffectModeSchema,
  pauseDensity: voicePauseDensitySchema,
  emphasisBudget: voiceEmphasisBudgetSchema,
  repairMode: voiceRepairModeSchema,
  toneDirectives: z.array(z.string().trim().min(1)),
  forbiddenMoves: z.array(z.string().trim().min(1)),
  renderHints: z.array(z.string().trim().min(1)),
});

const uiMessageFrameSchema = z.enum([
  "plain_reply",
  "support_panel",
  "reflective_prompt",
  "plan_outline",
]);

const uiCtaModeSchema = z.enum([
  "none",
  "soft_actions",
  "primary_and_secondary",
]);

const uiCardDensitySchema = z.enum(["minimal", "balanced", "rich"]);

const uiAlertStyleSchema = z.enum([
  "none",
  "gentle_notice",
  "protective_notice",
]);

const uiComposerModeSchema = z.enum([
  "default",
  "followup_invite",
  "guided_checkin",
]);

const compiledUiExpressionSchema = z.object({
  channel: z.literal("ui"),
  messageFrame: uiMessageFrameSchema,
  ctaMode: uiCtaModeSchema,
  cardDensity: uiCardDensitySchema,
  alertStyle: uiAlertStyleSchema,
  composerMode: uiComposerModeSchema,
  toneDirectives: z.array(z.string().trim().min(1)),
  forbiddenMoves: z.array(z.string().trim().min(1)),
  renderHints: z.array(z.string().trim().min(1)),
});

const compiledExpressionSetSchema = z.object({
  text: compiledTextExpressionSchema,
  voice: compiledVoiceExpressionSchema,
  ui: compiledUiExpressionSchema,
});

export {
  compiledExpressionSetSchema,
  compiledTextExpressionSchema,
  compiledUiExpressionSchema,
  compiledVoiceExpressionSchema,
  expressionChannelSchema,
  expressionCompilerInputBaseSchema,
  expressionContextSchema,
  expressionSignalConsumptionModeSchema,
  expressionSignalDriverSchema,
  expressionSignalStrengthBandSchema,
  textBodyModeSchema,
  textClosingModeSchema,
  textExpressionCompilerInputSchema,
  textFollowupModeSchema,
  textOpeningModeSchema,
  textSuggestionModeSchema,
  textToolUseModeSchema,
  uiAlertStyleSchema,
  uiCardDensitySchema,
  uiComposerModeSchema,
  uiCtaModeSchema,
  uiExpressionCompilerInputSchema,
  uiMessageFrameSchema,
  voiceAffectModeSchema,
  voiceCadenceModeSchema,
  voiceEmphasisBudgetSchema,
  voiceExpressionCompilerInputSchema,
  voicePauseDensitySchema,
  voiceRepairModeSchema,
};

export type CompiledExpressionSet = z.infer<typeof compiledExpressionSetSchema>;
export type CompiledTextExpression = z.infer<
  typeof compiledTextExpressionSchema
>;
export type CompiledUiExpression = z.infer<typeof compiledUiExpressionSchema>;
export type CompiledVoiceExpression = z.infer<
  typeof compiledVoiceExpressionSchema
>;
export type ExpressionChannel = z.infer<typeof expressionChannelSchema>;
export type ExpressionContext = z.infer<typeof expressionContextSchema>;
export type ExpressionSignalConsumptionMode = z.infer<
  typeof expressionSignalConsumptionModeSchema
>;
export type ExpressionSignalDriver = z.infer<
  typeof expressionSignalDriverSchema
>;
export type ExpressionSignalStrengthBand = z.infer<
  typeof expressionSignalStrengthBandSchema
>;
export type TextBodyMode = z.infer<typeof textBodyModeSchema>;
export type TextClosingMode = z.infer<typeof textClosingModeSchema>;
export type TextExpressionCompilerInput = z.infer<
  typeof textExpressionCompilerInputSchema
>;
export type TextFollowupMode = z.infer<typeof textFollowupModeSchema>;
export type TextOpeningMode = z.infer<typeof textOpeningModeSchema>;
export type TextSuggestionMode = z.infer<typeof textSuggestionModeSchema>;
export type TextToolUseMode = z.infer<typeof textToolUseModeSchema>;
export type UiAlertStyle = z.infer<typeof uiAlertStyleSchema>;
export type UiCardDensity = z.infer<typeof uiCardDensitySchema>;
export type UiComposerMode = z.infer<typeof uiComposerModeSchema>;
export type UiCtaMode = z.infer<typeof uiCtaModeSchema>;
export type UiExpressionCompilerInput = z.infer<
  typeof uiExpressionCompilerInputSchema
>;
export type UiMessageFrame = z.infer<typeof uiMessageFrameSchema>;
export type VoiceAffectMode = z.infer<typeof voiceAffectModeSchema>;
export type VoiceCadenceMode = z.infer<typeof voiceCadenceModeSchema>;
export type VoiceEmphasisBudget = z.infer<typeof voiceEmphasisBudgetSchema>;
export type VoiceExpressionCompilerInput = z.infer<
  typeof voiceExpressionCompilerInputSchema
>;
export type VoicePauseDensity = z.infer<typeof voicePauseDensitySchema>;
export type VoiceRepairMode = z.infer<typeof voiceRepairModeSchema>;
