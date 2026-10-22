import { defaultMaterializedToolAllowlist } from "../tools/execution-tool-names";

type MaterializableSchedule = {
	id: string;
	type: "reminder" | "alarm" | "monitor";
	title: string;
	content: string;
	triggerAt: string | null;
	timezone: string;
	metadata: Record<string, unknown>;
	blueprint: unknown;
};

type MaterializedToolPolicySnapshot = {
	toolAllowlist: string[];
	timeoutMs: number | null;
	maxSteps: number | null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const readNullableNumber = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const readBlueprint = (schedule: MaterializableSchedule) =>
	asRecord(schedule.blueprint);

const readBlueprintPrompt = (schedule: MaterializableSchedule) => {
	const prompt = readBlueprint(schedule).prompt;
	return typeof prompt === "string" && prompt.trim().length > 0
		? prompt.trim()
		: null;
};

const readToolAllowlist = (schedule: MaterializableSchedule) => {
	const toolAllowlist = readBlueprint(schedule).toolAllowlist;

	if (!Array.isArray(toolAllowlist)) {
		return null;
	}

	const sanitized = toolAllowlist.filter(
		(value): value is string =>
			typeof value === "string" && value.trim().length > 0
	);

	return sanitized.length > 0 ? sanitized : null;
};

const buildExecutionContext = (input: {
	schedule: MaterializableSchedule;
	scheduledFor: string;
}) => {
	const blueprint = readBlueprint(input.schedule);

	return {
		scheduleId: input.schedule.id,
		scheduleType: input.schedule.type,
		scheduledFor: input.scheduledFor,
		timezone: input.schedule.timezone,
		title: input.schedule.title,
		content: input.schedule.content,
		deliveryIntent: asRecord(blueprint.deliveryIntent),
		input: asRecord(blueprint.input),
		metadata: input.schedule.metadata,
	};
};

const buildFallbackOriginalTask = (schedule: MaterializableSchedule) =>
	[
		`Title: ${schedule.title}`,
		`Task: ${schedule.content}`,
		schedule.metadata && Object.keys(schedule.metadata).length > 0
			? `Context metadata: ${JSON.stringify(schedule.metadata, null, 2)}`
			: null,
	]
		.filter(Boolean)
		.join("\n\n");

const compileScheduleExecutionPrompt = (input: {
	schedule: MaterializableSchedule;
	scheduledFor: string;
}) => {
	const originalPrompt =
		readBlueprintPrompt(input.schedule) ??
		buildFallbackOriginalTask(input.schedule);
	const executionContext = buildExecutionContext(input);

	return [
		"This scheduled task is due now.",
		"The time condition has already been satisfied.",
		"Execute the task now instead of scheduling it again.",
		"Do not create, update, delete, or request another schedule unless schedule management is the task itself.",
		"",
		"Original task:",
		originalPrompt,
		"",
		"Execution context:",
		JSON.stringify(executionContext, null, 2),
	].join("\n");
};

const buildFallbackPrompt = (schedule: MaterializableSchedule) =>
	compileScheduleExecutionPrompt({
		schedule,
		scheduledFor: schedule.triggerAt ?? "unscheduled",
	});

const buildMaterializedToolPolicySnapshot = (
	schedule: MaterializableSchedule
): MaterializedToolPolicySnapshot => {
	const blueprint = readBlueprint(schedule);
	const explicitAllowlist = readToolAllowlist(schedule);

	return {
		toolAllowlist: explicitAllowlist ?? [...defaultMaterializedToolAllowlist],
		timeoutMs: readNullableNumber(blueprint.timeoutMs),
		maxSteps: readNullableNumber(blueprint.maxSteps),
	};
};

export type { MaterializableSchedule, MaterializedToolPolicySnapshot };
export {
	buildFallbackPrompt,
	buildMaterializedToolPolicySnapshot,
	compileScheduleExecutionPrompt,
};
