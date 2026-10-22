import type {
  ScheduleCreateInput,
  ScheduleUpdateInput,
} from "@neobuni/contracts";

import {
  getNextCronLocalDisplay,
  getNextCronTriggerAt,
  matchesCronSchedule,
  validateCronSchedule,
} from "./recurrence";

interface PersistedSchedule {
  content: string;
  createdAt: string;
  cronExpr: string | null;
  deliveredAt: string | null;
  id: string;
  lastTriggeredAt: string | null;
  metadata: Record<string, unknown>;
  profileId: string;
  status: "active" | "paused" | "completed" | "cancelled";
  timezone: string;
  title: string;
  triggerAt: string | null;
  type: "reminder" | "alarm" | "monitor";
  updatedAt: string;
}

interface SchedulePlanErrorInput {
  field: "cronExpr" | "triggerAt";
  message: string;
}

class SchedulePlanError extends Error {
  field: SchedulePlanErrorInput["field"];

  constructor(input: SchedulePlanErrorInput) {
    super(`${input.field}: ${input.message}`);
    this.name = "SchedulePlanError";
    this.field = input.field;
  }
}

const buildSchedulePlanError = (input: SchedulePlanErrorInput) =>
  new SchedulePlanError(input);

const validateExplicitCronTriggerAt = (input: {
  cronExpr: string;
  timezone: string;
  triggerAt: string;
}) => {
  if (
    !matchesCronSchedule({
      cronExpr: input.cronExpr,
      timezone: input.timezone,
      candidateIso: input.triggerAt,
    })
  ) {
    throw buildSchedulePlanError({
      field: "triggerAt",
      message: "triggerAt must match cronExpr in the provided timezone.",
    });
  }
};

const resolveCronTriggerAt = (input: {
  cronExpr: string;
  timezone: string;
  triggerAt: string | null | undefined;
  referenceNow: string;
}) => {
  const validation = validateCronSchedule({
    cronExpr: input.cronExpr,
    timezone: input.timezone,
  });

  if (!validation.valid) {
    throw buildSchedulePlanError({
      field: "cronExpr",
      message: validation.error ?? "Invalid cron expression.",
    });
  }

  if (input.triggerAt) {
    validateExplicitCronTriggerAt({
      cronExpr: input.cronExpr,
      timezone: input.timezone,
      triggerAt: input.triggerAt,
    });

    return {
      triggerAt: input.triggerAt,
      localDisplay: getNextCronLocalDisplay({
        cronExpr: input.cronExpr,
        timezone: input.timezone,
        afterIso: new Date(Date.parse(input.triggerAt) - 1).toISOString(),
      }),
    };
  }

  const nextTriggerAt = getNextCronTriggerAt({
    cronExpr: input.cronExpr,
    timezone: input.timezone,
    afterIso: input.referenceNow,
  });

  return {
    triggerAt: nextTriggerAt,
    localDisplay: getNextCronLocalDisplay({
      cronExpr: input.cronExpr,
      timezone: input.timezone,
      afterIso: input.referenceNow,
    }),
  };
};

const planScheduleCreateInput = (input: {
  schedule: ScheduleCreateInput;
  referenceNow: string;
}) => {
  if (input.schedule.cronExpr === null) {
    return input.schedule;
  }

  const resolved = resolveCronTriggerAt({
    cronExpr: input.schedule.cronExpr,
    timezone: input.schedule.timezone,
    triggerAt: input.schedule.triggerAt,
    referenceNow: input.referenceNow,
  });

  return {
    ...input.schedule,
    triggerAt: resolved.triggerAt,
    metadata: {
      ...input.schedule.metadata,
      localDisplay: resolved.localDisplay,
    },
  } satisfies ScheduleCreateInput;
};

const planScheduleUpdateInput = (input: {
  current: PersistedSchedule;
  update: ScheduleUpdateInput;
  referenceNow: string;
}) => {
  const cronExpr =
    input.update.cronExpr === undefined
      ? input.current.cronExpr
      : input.update.cronExpr;
  const timezone = input.update.timezone ?? input.current.timezone;
  const metadata = input.update.metadata ?? input.current.metadata;

  if (cronExpr === null) {
    return {
      ...input.update,
      timezone,
      metadata,
    } satisfies ScheduleUpdateInput;
  }

  const shouldReplanTriggerAt =
    input.update.cronExpr !== undefined ||
    input.update.timezone !== undefined ||
    input.update.triggerAt !== undefined ||
    (input.update.status === "active" && input.current.status !== "active");

  if (!shouldReplanTriggerAt) {
    const validation = validateCronSchedule({ cronExpr, timezone });

    if (!validation.valid) {
      throw buildSchedulePlanError({
        field: "cronExpr",
        message: validation.error ?? "Invalid cron expression.",
      });
    }

    return {
      ...input.update,
      timezone,
      metadata,
    } satisfies ScheduleUpdateInput;
  }

  const resolved = resolveCronTriggerAt({
    cronExpr,
    timezone,
    triggerAt: input.update.triggerAt,
    referenceNow: input.referenceNow,
  });

  return {
    ...input.update,
    cronExpr,
    timezone,
    triggerAt: resolved.triggerAt,
    metadata: {
      ...metadata,
      localDisplay: resolved.localDisplay,
    },
  } satisfies ScheduleUpdateInput;
};

export type { PersistedSchedule };
export { planScheduleCreateInput, planScheduleUpdateInput, SchedulePlanError };
