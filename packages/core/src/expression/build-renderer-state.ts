import type {
	CompiledExpressionSet,
	ExpressionContext,
	RendererState,
	ResponseSpec,
} from "@neobuni/contracts";

import { renderUiExpression } from "./render-ui-expression";
import { renderVoiceExpression } from "./render-voice-expression";

const buildRendererState = (input: {
	expressionSet: CompiledExpressionSet;
	context: ExpressionContext;
	responseSpec: ResponseSpec;
}): RendererState => ({
	voice: renderVoiceExpression(input.expressionSet.voice),
	ui: renderUiExpression({
		expression: input.expressionSet.ui,
		context: input.context,
		responseSpec: input.responseSpec,
	}),
});

export { buildRendererState };
