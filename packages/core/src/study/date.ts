const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseLocalDate = (localDate: string): Date => {
  if (!LOCAL_DATE_PATTERN.test(localDate)) {
    throw new Error(`Invalid local date: ${localDate}`);
  }
  const parsed = new Date(`${localDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid local date: ${localDate}`);
  }
  return parsed;
};

const toLocalDate = (date: Date): string => date.toISOString().slice(0, 10);

const addLocalDays = (localDate: string, days: number): string => {
  const parsed = parseLocalDate(localDate);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return toLocalDate(parsed);
};

const dayOfWeek = (localDate: string): number =>
  parseLocalDate(localDate).getUTCDay();

const diffLocalDays = (from: string, to: string): number =>
  Math.round(
    (parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86_400_000
  );

/**
 * Local date-times use `YYYY-MM-DDTHH:mm(:ss)` without a timezone offset.
 * Comparing them lexicographically is safe because the format is fixed and
 * zero-padded, but normalizing through UTC keeps seconds optional.
 */
const localDateTimeToEpoch = (value: string): number => {
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const parsed = Date.parse(`${withSeconds}Z`);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid local date-time: ${value}`);
  }
  return parsed;
};

const compareLocalDateTime = (left: string, right: string): number =>
  localDateTimeToEpoch(left) - localDateTimeToEpoch(right);

const addMinutesToClock = (clock: string, minutes: number): string => {
  const [hours = 0, mins = 0] = clock.split(":").map(Number);
  const total = Math.max(0, hours * 60 + mins + minutes);
  const nextHours = Math.floor(total / 60) % 24;
  const nextMinutes = total % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
};

const toLocalDateTime = (localDate: string, clock: string): string =>
  `${localDate}T${clock}`;

const localDateOf = (localDateTime: string): string =>
  localDateTime.slice(0, 10);

export {
  addLocalDays,
  addMinutesToClock,
  compareLocalDateTime,
  dayOfWeek,
  diffLocalDays,
  localClockInTimeZone,
  localDateInTimeZone,
  localDateOf,
  localDateTimeInTimeZone,
  localDateTimeToEpoch,
  parseLocalDate,
  toLocalDate,
  toLocalDateTime,
};

const localDateInTimeZone = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

const localClockInTimeZone = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);

const localDateTimeInTimeZone = (instant: Date, timeZone: string): string =>
  `${localDateInTimeZone(instant, timeZone)}T${localClockInTimeZone(instant, timeZone)}`;
