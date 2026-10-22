import {
	appendEvent as appendEventFx,
	listSchedules as listSchedulesFx,
	runRepo,
} from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
	runRepo(appendEventFx(...args));
const listSchedules = (...args: Parameters<typeof listSchedulesFx>) =>
	runRepo(listSchedulesFx(...args));

import { listSchedulesDef, listSchedulesInputSchema } from "@neobuni/contracts";

import type { ServerToolContext } from "./types";

type PersistedSchedule = Awaited<ReturnType<typeof listSchedules>>[number];

const statusRank: Record<PersistedSchedule["status"], number> = {
	active: 0,
	paused: 1,
	completed: 2,
	cancelled: 3,
};

const matchesEnumFilter = <T extends string>(
	allowed: readonly T[] | undefined,
	value: T
) => allowed === undefined || allowed.includes(value);

const isUpcomingSchedule = (
	schedule: PersistedSchedule,
	referenceNow: string
) =>
	schedule.status === "active" &&
	schedule.triggerAt !== null &&
	Date.parse(schedule.triggerAt) >= Date.parse(referenceNow);

const compareSchedulesForDisplay = (
	left: PersistedSchedule,
	right: PersistedSchedule
) => {
	if (
		left.triggerAt !== null &&
		right.triggerAt !== null &&
		left.triggerAt !== right.triggerAt
	) {
		return left.triggerAt.localeCompare(right.triggerAt);
	}

	if (left.triggerAt !== null && right.triggerAt === null) {
		return -1;
	}

	if (left.triggerAt === null && right.triggerAt !== null) {
		return 1;
	}

	if (left.status !== right.status) {
		return statusRank[left.status] - statusRank[right.status];
	}

	if (left.updatedAt !== right.updatedAt) {
		return right.updatedAt.localeCompare(left.updatedAt);
	}

	return left.title.localeCompare(right.title);
};

const filterAndOrderSchedulesForTool = (input: {
	schedules: readonly PersistedSchedule[];
	filter: {
		types?: readonly PersistedSchedule["type"][];
		statuses?: readonly PersistedSchedule["status"][];
		upcomingOnly?: boolean;
		limit?: number;
	};
	referenceNow: string;
}) => {
	const filtered = input.schedules.filter((schedule) => {
		if (!matchesEnumFilter(input.filter.types, schedule.type)) {
			return false;
		}

		if (!matchesEnumFilter(input.filter.statuses, schedule.status)) {
			return false;
		}

		if (
			input.filter.upcomingOnly === true &&
			!isUpcomingSchedule(schedule, input.referenceNow)
		) {
			return false;
		}

		return true;
	});

	const ordered = [...filtered].sort(compareSchedulesForDisplay);

	return input.filter.limit === undefined
		? ordered
		: ordered.slice(0, input.filter.limit);
};

const createListSchedulesTool = (context: ServerToolContext) =>
	listSchedulesDef.server(async (args) => {
		const input = listSchedulesInputSchema.parse(args);
		const schedules = await listSchedules(context.profileId);
		const items = filterAndOrderSchedulesForTool({
			schedules,
			filter: input,
			referenceNow: context.referenceNow,
		}).map((schedule) => ({
			id: schedule.id,
			type: schedule.type,
			status: schedule.status,
			title: schedule.title,
			content: schedule.content,
			triggerAt: schedule.triggerAt,
			cronExpr: schedule.cronExpr,
			timezone: schedule.timezone,
			lastTriggeredAt: schedule.lastTriggeredAt,
			deliveredAt: schedule.deliveredAt,
			createdAt: schedule.createdAt,
			updatedAt: schedule.updatedAt,
		}));

		await appendEvent(context.profileId, "tool.list_schedules", {
			conversationId: context.conversationId,
			turnId: context.turnId,
			count: items.length,
			types: input.types ?? null,
			statuses: input.statuses ?? null,
			upcomingOnly: input.upcomingOnly ?? false,
			limit: input.limit ?? null,
		});

		return {
			referenceNow: context.referenceNow,
			count: items.length,
			items,
		};
	});

export { createListSchedulesTool, filterAndOrderSchedulesForTool };
