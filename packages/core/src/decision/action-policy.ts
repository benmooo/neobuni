import type {
	ActionAuthorization,
	ActionProposal,
	ActionRunInput,
} from "@neobuni/contracts";

const isActiveExecutionAuthorization = (input: {
	authorization: ActionAuthorization;
	proposal: ActionProposal;
	nowIso: string;
}) =>
	input.authorization.profileId === input.proposal.profileId &&
	input.authorization.proposalId === input.proposal.id &&
	input.authorization.mode === "execute" &&
	input.authorization.grantedBy === "user" &&
	input.authorization.revokedAt === null &&
	(input.authorization.expiresAt === null ||
		Date.parse(input.authorization.expiresAt) > Date.parse(input.nowIso)) &&
	input.proposal.status !== "cancelled" &&
	input.proposal.status !== "completed";

const hasExactTelegramTargetAuthorization = (input: {
	authorization: ActionAuthorization;
	action: Extract<ActionRunInput, { operation: "telegram_message_send" }>;
}) => {
	const constraints = input.authorization.constraints;
	return (
		constraints.platform === "telegram" &&
		constraints.requiresConfirmation === true &&
		(constraints.targetAlias === input.action.targetAlias ||
			constraints.targetId === input.action.targetId)
	);
};

const isProposalInputBoundToCandidate = (input: {
	proposal: ActionProposal;
	action: ActionRunInput;
}) =>
	input.action.operation === "commitment_status_update"
		? input.proposal.candidateId ===
				`commitment:${input.action.commitmentId}` &&
			input.action.expectedStatus !== input.action.nextStatus
		: input.action.operation === "telegram_message_send"
			? input.proposal.kind === "telegram_message" &&
				input.proposal.input.messageKind === input.action.messageKind &&
				input.proposal.input.targetAlias === input.action.targetAlias &&
				input.proposal.input.targetId === input.action.targetId &&
				input.proposal.input.text === input.action.text
			: false;

const isActionAuthorizedForExecution = (input: {
	authorization: ActionAuthorization;
	proposal: ActionProposal;
	action: ActionRunInput;
	nowIso: string;
}) =>
	isActiveExecutionAuthorization(input) &&
	(input.action.operation === "commitment_status_update"
		? input.proposal.reversibility === "reversible"
		: input.action.operation === "telegram_message_send"
			? hasExactTelegramTargetAuthorization({
					authorization: input.authorization,
					action: input.action,
				})
			: false);

export {
	isActionAuthorizedForExecution,
	isActiveExecutionAuthorization,
	isProposalInputBoundToCandidate,
};
