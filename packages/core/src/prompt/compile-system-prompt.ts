import { compilePromptPacket, type SystemPromptContext } from "./compile-prompt-packet";

const compileSystemPrompt = (context: SystemPromptContext) =>
  compilePromptPacket(context).systemPrompt;

export { compileSystemPrompt };
export type { SystemPromptContext };
