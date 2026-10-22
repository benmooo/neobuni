import type {
	Schedule,
	ScheduleListItem,
	TaskRun,
	TaskRunSummary,
} from "@neobuni/contracts";

type ScheduleType = Schedule["type"];
type ScheduleStatus = Schedule["status"];
type TaskRunStatus = TaskRun["status"];

const scheduleTypeLabel: Record<ScheduleType, string> = {
	reminder: "提醒",
	alarm: "闹钟",
	monitor: "监控",
};

const scheduleStatusLabel: Record<ScheduleStatus, string> = {
	active: "active",
	paused: "paused",
	completed: "completed",
	cancelled: "cancelled",
};

const taskRunStatusLabel: Record<TaskRunStatus, string> = {
	queued: "queued",
	claimed: "claimed",
	running: "running",
	succeeded: "succeeded",
	failed: "failed",
	retry_scheduled: "retry scheduled",
	cancelled: "cancelled",
};

const scheduleStatusVariant: Record<
	ScheduleStatus,
	"outline" | "secondary" | "destructive"
> = {
	active: "outline",
	paused: "secondary",
	completed: "secondary",
	cancelled: "destructive",
};

const taskRunStatusVariant: Record<
	TaskRunStatus,
	"outline" | "secondary" | "destructive"
> = {
	queued: "secondary",
	claimed: "secondary",
	running: "secondary",
	succeeded: "outline",
	failed: "destructive",
	retry_scheduled: "secondary",
	cancelled: "destructive",
};

const formatDateTime = (value: string) =>
	new Intl.DateTimeFormat("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));

const formatScheduleTiming = (
	input: Pick<Schedule, "triggerAt" | "cronExpr" | "timezone">
) => {
	if (input.triggerAt) {
		return `单次 · ${formatDateTime(input.triggerAt)} · ${input.timezone}`;
	}

	if (input.cronExpr) {
		return `重复 · ${input.cronExpr} · ${input.timezone}`;
	}

	return `未调度 · ${input.timezone}`;
};

const resolveTaskRunErrorMessage = (
	taskRun: Pick<TaskRunSummary, "error"> | Pick<TaskRun, "error"> | null
) => {
	const message = taskRun?.error?.message;
	return typeof message === "string" && message.trim().length > 0
		? message
		: null;
};

const resolveTaskRunResultPreview = (
	taskRun: Pick<TaskRun, "result"> | null
) => {
	const assistantText = taskRun?.result?.assistantText;
	return typeof assistantText === "string" && assistantText.trim().length > 0
		? assistantText
		: null;
};

const getScheduleTypeLabel = (type: ScheduleType) => scheduleTypeLabel[type];
const getScheduleStatusLabel = (status: ScheduleStatus) =>
	scheduleStatusLabel[status];
const getScheduleStatusVariant = (status: ScheduleStatus) =>
	scheduleStatusVariant[status];
const getTaskRunStatusLabel = (status: TaskRunStatus) =>
	taskRunStatusLabel[status];
const getTaskRunStatusVariant = (status: TaskRunStatus) =>
	taskRunStatusVariant[status];

const getLatestTaskRunSubtitle = (
	schedule: Pick<ScheduleListItem, "latestTaskRun">
) => {
	if (!schedule.latestTaskRun) {
		return "还没有执行记录";
	}

	const errorMessage = resolveTaskRunErrorMessage(schedule.latestTaskRun);
	if (errorMessage) {
		return errorMessage;
	}

	return `scheduled ${formatDateTime(schedule.latestTaskRun.scheduledFor)}`;
};

export {
	formatScheduleTiming,
	getLatestTaskRunSubtitle,
	getScheduleStatusLabel,
	getScheduleStatusVariant,
	getScheduleTypeLabel,
	getTaskRunStatusLabel,
	getTaskRunStatusVariant,
	resolveTaskRunErrorMessage,
	resolveTaskRunResultPreview,
};
