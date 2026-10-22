import type {
  CompiledExpressionSet,
  ProviderPromptPacket,
  PromptSection,
  WorkingMemory,
  GoalPromptContext,
} from "@neobuni/contracts"

import {
  buildSoulRuntimePrompt,
  type SoulRuntimeState,
} from "../soul/soul-runtime"

type PromptRecalledMemory = {
  content: string
  type: string
  keywords: string[]
}

type SystemPromptContext = {
  aiName: string
  userName: string
  userPersona: string
  memories?: PromptRecalledMemory[]
  workingMemory?: WorkingMemory
  soulRuntime?: SoulRuntimeState
  expressionSet?: CompiledExpressionSet
  goalContext?: GoalPromptContext
}

const formatMemories = (memories: PromptRecalledMemory[]): string =>
  memories.map((memory) => `- [${memory.type}] ${memory.content}`).join("\n")

const formatWorkingMemorySection = (
  title: string,
  items: Array<{ content: string }>,
) =>
  items.length > 0
    ? `${title}:\n${items.map((item) => `- ${item.content}`).join("\n")}`
    : ""

const formatWorkingMemory = (workingMemory: WorkingMemory) => {
  const sections = [
    `Focus: ${workingMemory.focus}`,
    formatWorkingMemorySection(
      "Relationship state",
      workingMemory.relationshipState,
    ),
    formatWorkingMemorySection("Emotional state", workingMemory.emotionalState),
    formatWorkingMemorySection(
      "Personal context",
      workingMemory.personalContext,
    ),
    formatWorkingMemorySection("Active tasks", workingMemory.activeTasks),
    formatWorkingMemorySection("World facts", workingMemory.worldFacts),
    workingMemory.openLoops.length > 0
      ? `Open loops:\n${workingMemory.openLoops.map((item) => `- ${item.summary}`).join("\n")}`
      : "",
    workingMemory.constraints.length > 0
      ? `Constraints:\n${workingMemory.constraints.map((item) => `- [${item.kind}] ${item.content}`).join("\n")}`
      : "",
    workingMemory.actionCandidates.length > 0
      ? `Action candidates:\n${workingMemory.actionCandidates.map((item) => `- [${item.kind}] ${item.content} (score ${item.score.toFixed(2)})`).join("\n")}`
      : "",
  ].filter((section) => section.length > 0)

  return sections.length > 0 ? ["Working memory:", ...sections].join("\n") : ""
}

const formatGoalContext = (goalContext: GoalPromptContext) => {
  const goals = goalContext.activeGoals.map(
    (goal) =>
      `- Goal: ${goal.title}\n  Desired outcome: ${goal.desiredOutcome}\n  Horizon: ${goal.horizon}`,
  )
  const commitments = goalContext.openCommitments.map(
    (commitment) =>
      `- ${commitment.status === "blocked" ? "Blocked" : "Open"}: ${commitment.title}${commitment.dueAt ? ` (due ${commitment.dueAt})` : ""}`,
  )
  return [
    "Active goal context (private; use it to keep help relevant, but do not claim progress or execute actions without evidence and authorization):",
    ...goals,
    ...(commitments.length > 0 ? ["Open commitments:", ...commitments] : []),
  ].join("\n")
}

const formatTextExpressionSection = (expressionSet: CompiledExpressionSet) =>
  [
    "Text expression plan:",
    `- Opening mode: ${expressionSet.text.openingMode}`,
    `- Body mode: ${expressionSet.text.bodyMode}`,
    `- Closing mode: ${expressionSet.text.closingMode}`,
    `- Follow-up mode: ${expressionSet.text.followupMode}`,
    `- Suggestion mode: ${expressionSet.text.suggestionMode}`,
    `- Tool use mode: ${expressionSet.text.toolUseMode}`,
    `- Tone directives: ${expressionSet.text.toneDirectives.join(", ")}`,
    `- Forbidden moves: ${expressionSet.text.forbiddenMoves.join(", ")}`,
    `- Render hints: ${expressionSet.text.renderHints.join(", ")}`,
  ].join("\n")

const TOOL_SEMANTICS_PROMPT = [
  "Tool semantics:",
  "- Describe only what the selected tools actually did. Do not claim a rebuild, regeneration, send, or delivery step unless the corresponding tool was called.",
  "- send_qq_message only delivers the provided QQ message payload. It does not read inbound QQ events or reopen a delivery window for you.",
].join("\n")

const compactSection = (section: PromptSection | null) =>
  section && section.body.trim().length > 0 ? [section] : []

const compilePromptPacket = (
  context: SystemPromptContext,
): ProviderPromptPacket => {
  const sections = [
    ...compactSection({
      key: "identity",
      title: "Identity",
      body: [
        `You are ${context.aiName}.`,
        `The user's name is ${context.userName}.`,
        context.userPersona ? `User context: ${context.userPersona}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }),
    ...compactSection(
      context.soulRuntime
        ? {
            key: "soul_runtime",
            title: "Soul Runtime",
            body: buildSoulRuntimePrompt(context.soulRuntime),
          }
        : null,
    ),
    ...compactSection(
      context.expressionSet
        ? {
            key: "text_expression",
            title: "Text Expression",
            body: formatTextExpressionSection(context.expressionSet),
          }
        : null,
    ),
    ...compactSection(
      context.goalContext &&
        (context.goalContext.activeGoals.length > 0 ||
          context.goalContext.openCommitments.length > 0)
        ? {
            key: "goal_context",
            title: "Active Goal Context",
            body: formatGoalContext(context.goalContext),
          }
        : null,
    ),
    ...compactSection({
      key: "tool_semantics",
      title: "Tool Semantics",
      body: TOOL_SEMANTICS_PROMPT,
    }),
    ...compactSection(
      context.workingMemory
        ? {
            key: "working_memory",
            title: "Working Memory",
            body: formatWorkingMemory(context.workingMemory),
          }
        : null,
    ),
    ...compactSection(
      !context.workingMemory && context.memories?.length
        ? {
            key: "background_memories",
            title: "Background Memories",
            body: `Background memories:\n${formatMemories(context.memories)}`,
          }
        : null,
    ),
  ]

  return {
    systemPrompt: sections.map((section) => section.body).join("\n"),
    sections,
    compiledExpression: context.expressionSet ?? null,
  }
}

export { compilePromptPacket }
export type { PromptRecalledMemory, SystemPromptContext }
