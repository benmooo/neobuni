import { z } from "zod";

import { isoDateTimeSchema } from "../platform/common/base";

const durableRunStatusSchema = z.enum([
	"queued",
	"claimed",
	"running",
	"succeeded",
	"failed",
	"retry_scheduled",
	"cancelled",
]);
const durableRunLeaseSchema = z.object({
	leaseOwner: z.string().trim().min(1).nullable(),
	leaseExpiresAt: isoDateTimeSchema.nullable(),
});
const durableRunStateSchema = z.object({
	status: durableRunStatusSchema,
	attempt: z.number().int().nonnegative(),
	maxAttempts: z.number().int().positive(),
	leaseExpiresAt: isoDateTimeSchema.nullable(),
	nextRetryAt: isoDateTimeSchema.nullable(),
});

export { durableRunLeaseSchema, durableRunStateSchema, durableRunStatusSchema };
export type DurableRunLease = z.infer<typeof durableRunLeaseSchema>;
export type DurableRunState = z.infer<typeof durableRunStateSchema>;
export type DurableRunStatus = z.infer<typeof durableRunStatusSchema>;
