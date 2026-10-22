type LocalDateParts = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
};

const parseJson = <T>(text: string, fallback: T): T => {
	try {
		return JSON.parse(text) as T;
	} catch {
		return fallback;
	}
};

const isValidTimeZone = (value: string) => {
	try {
		new Intl.DateTimeFormat("en-US", {
			timeZone: value,
		}).format(new Date());
		return true;
	} catch {
		return false;
	}
};

const normalizeTimeZone = (
	value: string | null | undefined,
	fallback = "UTC"
) => {
	if (value && isValidTimeZone(value)) {
		return value;
	}

	return isValidTimeZone(fallback) ? fallback : "UTC";
};

const unique = <T>(values: T[]) => [...new Set(values)];

const getZonedParts = (date: Date, timeZone: string): LocalDateParts => {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(date);

	const read = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((part) => part.type === type)?.value ?? "0");

	return {
		year: read("year"),
		month: read("month"),
		day: read("day"),
		hour: read("hour"),
		minute: read("minute"),
		second: read("second"),
	};
};

const getOffsetMs = (date: Date, timeZone: string) => {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		timeZoneName: "longOffset",
		hour: "2-digit",
		minute: "2-digit",
	}).formatToParts(date);
	const offsetText =
		parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
	const match = offsetText.match(/^GMT([+-])(\d{2}):(\d{2})$/);

	if (!match) {
		return 0;
	}

	const [, sign, hours, minutes] = match;
	const direction = sign === "-" ? -1 : 1;

	return direction * (Number(hours) * 60 + Number(minutes)) * 60_000;
};

const getTimezoneOffsetMinutes = (date: Date, timeZone: string) =>
	Math.round(getOffsetMs(date, timeZone) / 60_000);

const toUtcDateFromLocalParts = (
	input: Omit<LocalDateParts, "second"> & { second?: number },
	timeZone: string
) => {
	const utcGuess = new Date(
		Date.UTC(
			input.year,
			input.month - 1,
			input.day,
			input.hour,
			input.minute,
			input.second ?? 0
		)
	);
	const initial = new Date(
		utcGuess.getTime() - getOffsetMs(utcGuess, timeZone)
	);
	return new Date(utcGuess.getTime() - getOffsetMs(initial, timeZone));
};

const formatLocalDisplay = (iso: string, timeZone: string) => {
	const parts = getZonedParts(new Date(iso), timeZone);
	const pad = (value: number) => String(value).padStart(2, "0");

	return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)} ${timeZone}`;
};

const addLocalDays = (
	input: Pick<LocalDateParts, "year" | "month" | "day">,
	days: number
) => {
	const next = new Date(
		Date.UTC(input.year, input.month - 1, input.day + days)
	);
	return {
		year: next.getUTCFullYear(),
		month: next.getUTCMonth() + 1,
		day: next.getUTCDate(),
	};
};

const parseClockTime = (sourceText: string) => {
	const match = sourceText.match(
		/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
	);

	if (!match) {
		return null;
	}

	const rawHour = Number(match[1]);
	const minute = Number(match[2] ?? "0");
	const meridiem = (match[3] ?? "").toLowerCase();

	if (
		!Number.isInteger(rawHour) ||
		rawHour < 1 ||
		rawHour > 12 ||
		!Number.isInteger(minute) ||
		minute < 0 ||
		minute > 59
	) {
		return null;
	}

	const hour = meridiem === "pm" ? (rawHour % 12) + 12 : rawHour % 12;

	return {
		hour,
		minute,
	};
};

const normalizeTimeExpression = (sourceText: string) =>
	sourceText
		.replace(/\s+/g, " ")
		.replace(/\b(\d{1,2}:\d{2})\s*(am|pm)\b/gi, (_, time, meridiem) => {
			const hour = Number(String(time).split(":")[0] ?? "0");
			return hour > 12 ? time : `${time} ${String(meridiem).toLowerCase()}`;
		})
		.replace(
			/\b(\d{1,2})\s*(am|pm)\s*(o'?clock)?\b/gi,
			(_, hour, meridiem, clock) =>
				`${hour} ${String(meridiem).toLowerCase()}${clock ? ` ${clock}` : ""}`.trim()
		)
		.trim();

const buildNormalizationVariants = (sourceText: string) => {
	const normalized = normalizeTimeExpression(sourceText);
	const strippedMeridiem = normalized.replace(
		/\b(1[3-9]|2[0-3])(:\d{2})?\s*(am|pm)\b/gi,
		"$1$2"
	);

	return unique(
		[sourceText.trim(), normalized.trim(), strippedMeridiem.trim()].filter(
			(value) => value.length > 0
		)
	);
};

const tryParseAbsoluteDatetime = (sourceText: string) => {
	const trimmed = sourceText.trim();
	const hasExplicitTimezone =
		/(?:z|[+-]\d{2}:\d{2})$/i.test(trimmed) || /\b(?:utc|gmt)\b/i.test(trimmed);

	if (!hasExplicitTimezone) {
		return null;
	}

	const parsed = Date.parse(trimmed);

	if (Number.isNaN(parsed)) {
		return null;
	}

	return new Date(parsed).toISOString();
};

export {
	addLocalDays,
	buildNormalizationVariants,
	formatLocalDisplay,
	getTimezoneOffsetMinutes,
	getZonedParts,
	normalizeTimeZone,
	parseClockTime,
	parseJson,
	toUtcDateFromLocalParts,
	tryParseAbsoluteDatetime,
};
