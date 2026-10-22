import type {
  CompiledExpressionSet,
  ExpressionContext,
  ExpressionSignalDriver,
  ResponseSpec,
} from "@neobuni/contracts";

import { compileTextExpression } from "./compile-text-expression";
import { compileUiExpression } from "./compile-ui-expression";
import { compileVoiceExpression } from "./compile-voice-expression";

const compileExpressionSet = (input: {
  responseSpec: ResponseSpec;
  context: ExpressionContext;
  signalDrivers: ExpressionSignalDriver[];
}): CompiledExpressionSet => ({
  text: compileTextExpression({
    channel: "text",
    responseSpec: input.responseSpec,
    context: input.context,
    signalDrivers: input.signalDrivers,
  }),
  voice: compileVoiceExpression({
    channel: "voice",
    responseSpec: input.responseSpec,
    context: input.context,
    signalDrivers: input.signalDrivers,
  }),
  ui: compileUiExpression({
    channel: "ui",
    responseSpec: input.responseSpec,
    context: input.context,
    signalDrivers: input.signalDrivers,
  }),
});

export { compileExpressionSet };
