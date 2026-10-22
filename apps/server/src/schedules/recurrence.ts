import { Cron } from "croner";

import { formatLocalDisplay } from "../tools/datetime-utils";

type CronScheduleInput = {
	cronExpr: string;
	timezone: string;
};

type CronScheduleValidationResult = {
	valid: boolean;
	error: string | null;
};

const CRONER_MODE = "5-part" as const;

const createCronExpression = (input: CronScheduleInput) =>
	new Cron(input.cronExpr, {
		timezone: input.timezone,
		paused: true,
		mode: CRONER_MODE,
	});

const validateCronSchedule = (
	input: CronScheduleInput
): CronScheduleValidationResult => {
	try {
		createCronExpression(input);
		return {
			valid: true,
			error: null,
		};
	} catch (error) {
		return {
			valid: false,
			error:
				error instanceof Error ? error.message : "Invalid cron expression.",
		};
	}
};

const assertValidCronSchedule = (input: CronScheduleInput) => {
	const validation = validateCronSchedule(input);

	if (!validation.valid) {
		throw new Error(validation.error ?? "Invalid cron expression.");
	}
};

const matchesCronSchedule = (
	input: CronScheduleInput & {
		candidateIso: string;
	}
) => {
	assertValidCronSchedule(input);

	return createCronExpression(input).match(new Date(input.candidateIso));
};

const getNextCronTriggerAt = (
	input: CronScheduleInput & {
		afterIso: string;
	}
) => {
	assertValidCronSchedule(input);

	const next = createCronExpression(input).nextRun(new Date(input.afterIso));

	if (!next) {
		throw new Error(
			`No future trigger could be derived from cron expression: ${input.cronExpr}`
		);
	}

	return next.toISOString();
};

const getNextCronLocalDisplay = (
	input: CronScheduleInput & {
		afterIso: string;
	}
) => formatLocalDisplay(getNextCronTriggerAt(input), input.timezone);

const getNextCronTriggers = (
	input: CronScheduleInput & {
		count: number;
		afterIso: string;
	}
) => {
	assertValidCronSchedule(input);

	return createCronExpression(input)
		.nextRuns(input.count, new Date(input.afterIso))
		.map((date) => date.toISOString());
};

export type { CronScheduleInput, CronScheduleValidationResult };
export {
	getNextCronLocalDisplay,
	getNextCronTriggerAt,
	getNextCronTriggers,
	matchesCronSchedule,
	validateCronSchedule,
};
