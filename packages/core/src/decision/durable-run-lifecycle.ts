import type { DurableRunState } from "@neobuni/contracts";

type ClaimableRunState = Pick<
	DurableRunState,
	"status" | "leaseExpiresAt" | "nextRetryAt"
>;
type FailureRunState = Pick<DurableRunState, "attempt" | "maxAttempts">;

const isDue = (dueAt: string | null, nowIso: string) =>
	dueAt === null || Date.parse(dueAt) <= Date.parse(nowIso);

const isExpiredLease = (input: {
	leaseExpiresAt: string | null;
	nowIso: string;
}) =>
	input.leaseExpiresAt !== null && isDue(input.leaseExpiresAt, input.nowIso);

const isClaimableDurableRun = (
	input: ClaimableRunState & { nowIso: string }
) => {
	const retryReady = isDue(input.nextRetryAt, input.nowIso);
	const isQueued = input.status === "queued";
	const isRetry = input.status === "retry_scheduled" && retryReady;
	const isReclaimable =
		input.status === "claimed" &&
		isExpiredLease({
			leaseExpiresAt: input.leaseExpiresAt,
			nowIso: input.nowIso,
		});
	return isQueued || isRetry || isReclaimable;
};

const canStartDurableRun = (status: DurableRunState["status"]) =>
	status === "claimed";

const isCancellableDurableRun = (status: DurableRunState["status"]) =>
	status === "queued" || status === "claimed";

const makeClaimPatch = (input: {
	nowIso: string;
	leaseOwner: string;
	leaseExpiresAt: string;
}) => ({
	status: "claimed" as const,
	leaseOwner: input.leaseOwner,
	leaseExpiresAt: input.leaseExpiresAt,
	updatedAt: input.nowIso,
});

const makeStartPatch = (input: { attempt: number; nowIso: string }) => ({
	status: "running" as const,
	attempt: input.attempt + 1,
	updatedAt: input.nowIso,
});

const makeCompletionPatch = (nowIso: string) => ({
	status: "succeeded" as const,
	finishedAt: nowIso,
	leaseOwner: null,
	leaseExpiresAt: null,
	nextRetryAt: null,
	updatedAt: nowIso,
});

const makeFailurePatch = (
	input: FailureRunState & {
		nowIso: string;
		nextRetryAt: string | null;
	}
) => {
	const retryScheduled =
		input.nextRetryAt !== null && input.attempt < input.maxAttempts;
	return {
		status: retryScheduled ? ("retry_scheduled" as const) : ("failed" as const),
		nextRetryAt: retryScheduled ? input.nextRetryAt : null,
		finishedAt: retryScheduled ? null : input.nowIso,
		leaseOwner: null,
		leaseExpiresAt: null,
		updatedAt: input.nowIso,
	};
};

const makeCancellationPatch = (nowIso: string) => ({
	status: "cancelled" as const,
	finishedAt: nowIso,
	leaseOwner: null,
	leaseExpiresAt: null,
	updatedAt: nowIso,
});

export {
	canStartDurableRun,
	isCancellableDurableRun,
	isClaimableDurableRun,
	isExpiredLease,
	makeCancellationPatch,
	makeClaimPatch,
	makeCompletionPatch,
	makeFailurePatch,
	makeStartPatch,
};
