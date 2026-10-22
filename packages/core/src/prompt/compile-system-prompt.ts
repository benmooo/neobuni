import {
	compilePromptPacket,
	type SystemPromptContext,
} from "./compile-prompt-packet";

const compileSystemPrompt = (context: SystemPromptContext) =>
	compilePromptPacket(context).systemPrompt;

export type { SystemPromptContext };
export { compileSystemPrompt };
