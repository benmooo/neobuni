import type { runtimeTurnSchema } from "@neobuni/contracts";
import { runtimeSpanSchema } from "@neobuni/contracts";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@neobuni/ui/components/accordion";
import { Badge } from "@neobuni/ui/components/badge";
import { Button } from "@neobuni/ui/components/button";
import { Card, CardContent } from "@neobuni/ui/components/card";
import { ScrollArea } from "@neobuni/ui/components/scroll-area";
import { Separator } from "@neobuni/ui/components/separator";
import { Spinner } from "@neobuni/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { z } from "zod";

import { api } from "@/lib/api";

type RuntimeTurn = z.infer<typeof runtimeTurnSchema>;
type RuntimeSpan = z.infer<typeof runtimeSpanSchema>;

type Props = {
	conversationId: string;
	initialTurnId?: string | null;
};

const statusVariant = {
	running: "secondary",
	completed: "secondary",
	failed: "destructive",
	aborted: "outline",
	skipped: "outline",
} as const;

const recallStrategyVariant = {
	pre_recall: "secondary",
	tool_fallback: "secondary",
	skip: "outline",
} as const;

const activationModeVariant = {
	prefetch: "secondary",
	defer_to_tool: "secondary",
	skip: "outline",
} as const;

const stageLabel = {
	request_received: "Request Received",
	user_message_persist: "User Message Persist",
	turn_context_load: "Turn Context Load",
	goal_context_load: "Goal Context Load",
	signal_normalization: "Signal Normalization",
	retrieval_signals: "Retrieval Signals",
	retrieval_plan: "Retrieval Plan",
	temporal_recall: "Temporal Recall",
	graph_recall: "Graph Recall",
	knowledge_recall: "Knowledge Recall",
	evidence_fusion: "Evidence Fusion",
	working_memory_build: "Working Memory Build",
	soul_runtime: "Soul Runtime",
	soul_decision: "Soul Decision",
	response_spec_build: "Response Spec Build",
	prompt_build: "Prompt Build",
	prompt_compile: "Prompt Compile",
	provider_stream: "Provider Stream",
	tool_call: "Tool Call",
	assistant_message_persist: "Assistant Message Persist",
	turn_finalize: "Turn Finalize",
} as const;

const formatDuration = (value: number | null | undefined) => {
	if (value === null || value === undefined) {
		return "--";
	}

	if (value < 1000) {
		return `${value}ms`;
	}

	return `${(value / 1000).toFixed(2)}s`;
};

const formatTimestamp = (value: string | null | undefined) => {
	if (!value) {
		return "--";
	}

	return new Intl.DateTimeFormat("zh-CN", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(new Date(value));
};

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const asRecord = (value: unknown): Record<string, unknown> | null =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

const asRecordArray = (value: unknown): Record<string, unknown>[] =>
	Array.isArray(value)
		? value
				.map((item) => asRecord(item))
				.filter((item): item is Record<string, unknown> => item !== null)
		: [];

const asStringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];

const getString = (record: Record<string, unknown> | null, key: string) =>
	typeof record?.[key] === "string" ? (record[key] as string) : null;

const getNumber = (record: Record<string, unknown> | null, key: string) =>
	typeof record?.[key] === "number" ? (record[key] as number) : null;

const getBoolean = (record: Record<string, unknown> | null, key: string) =>
	typeof record?.[key] === "boolean" ? (record[key] as boolean) : null;

const formatScore = (value: number | null | undefined) =>
	value === null || value === undefined ? "--" : value.toFixed(2);

const formatBoolean = (value: boolean | null | undefined) =>
	value === null || value === undefined ? "--" : value ? "yes" : "no";

const formatToken = (value: string | null | undefined) =>
	value ? value.replaceAll("_", " ") : "--";

const sortRecordsByScore = (records: Record<string, unknown>[]) =>
	[...records].sort(
		(left, right) =>
			(getNumber(right, "score") ?? Number.NEGATIVE_INFINITY) -
			(getNumber(left, "score") ?? Number.NEGATIVE_INFINITY)
	);

const getStatusBadgeVariant = (status: string) =>
	status in statusVariant
		? statusVariant[status as keyof typeof statusVariant]
		: "outline";

const getStrategyBadgeVariant = (strategy: string) =>
	strategy in activationModeVariant
		? activationModeVariant[strategy as keyof typeof activationModeVariant]
		: strategy in recallStrategyVariant
			? recallStrategyVariant[strategy as keyof typeof recallStrategyVariant]
			: "outline";

function SummaryItem({ label, value }: { label: string; value: string }) {
	return (
		<Card size="sm">
			<CardContent>
				<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
					{label}
				</p>
				<p className="mt-1 text-foreground text-sm">{value}</p>
			</CardContent>
		</Card>
	);
}

function SectionLabel({ children }: { children: string }) {
	return (
		<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
			{children}
		</p>
	);
}

function ReasonBadges({ reasons }: { reasons: string[] }) {
	if (reasons.length === 0) {
		return <span className="text-muted-foreground text-xs">none</span>;
	}

	return (
		<div className="flex flex-wrap gap-2">
			{reasons.map((reason) => (
				<Badge className="text-[11px]" key={reason} variant="outline">
					{reason}
				</Badge>
			))}
		</div>
	);
}

function InsightList({
	title,
	items,
}: {
	title: string;
	items: Array<{
		id: string;
		label: string;
		content: string;
		meta?: string;
	}>;
}) {
	return (
		<div className="space-y-2">
			<SectionLabel>{title}</SectionLabel>
			{items.length > 0 ? (
				<div className="space-y-2">
					{items.map((item) => (
						<Card key={item.id} size="sm">
							<CardContent>
								<div className="flex flex-wrap items-center gap-2">
									<Badge className="text-[11px]" variant="outline">
										{item.label}
									</Badge>
									{item.meta ? (
										<span className="text-muted-foreground text-xs">
											{item.meta}
										</span>
									) : null}
								</div>
								<p className="mt-2 text-foreground text-sm">{item.content}</p>
							</CardContent>
						</Card>
					))}
				</div>
			) : (
				<span className="text-muted-foreground text-xs">none</span>
			)}
		</div>
	);
}

function SignalDriverBadges({
	signals,
}: {
	signals: Record<string, unknown>[];
}) {
	if (signals.length === 0) {
		return <span className="text-muted-foreground text-xs">none</span>;
	}

	return (
		<div className="flex flex-wrap gap-2">
			{signals.map((signal, index) => (
				<Badge
					className="text-[11px]"
					key={`${getString(signal, "kind") ?? "signal"}-${index}`}
					variant="outline"
				>
					{formatToken(getString(signal, "kind"))}{" "}
					{formatScore(getNumber(signal, "score"))}{" "}
					{formatToken(getString(signal, "strengthBand"))}{" "}
					{formatToken(getString(signal, "consumptionMode"))}
				</Badge>
			))}
		</div>
	);
}

function JsonBlock({
	title,
	value,
	defaultOpen = false,
}: {
	title: string;
	value: unknown;
	defaultOpen?: boolean;
}) {
	if (!value) {
		return null;
	}

	return (
		<Accordion defaultValue={defaultOpen ? [title] : []}>
			<AccordionItem className="border-none" value={title}>
				<AccordionTrigger className="py-0 hover:no-underline">
					<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
						{title}
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-2">
					<Card size="sm">
						<CardContent>
							<pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-foreground leading-5">
								{prettyJson(value)}
							</pre>
						</CardContent>
					</Card>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}

function TurnCard({
	turn,
	selected,
	onSelect,
}: {
	turn: RuntimeTurn;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button className="w-full text-left" onClick={onSelect} type="button">
			<Card size="sm">
				<CardContent>
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="font-medium text-sm">Turn {turn.id.slice(0, 8)}</p>
							<p className="mt-1 text-muted-foreground text-xs">
								{formatTimestamp(turn.startedAt)}
							</p>
						</div>
						<div className="flex flex-wrap justify-end gap-2">
							{selected ? <Badge variant="outline">当前</Badge> : null}
							<Badge
								className="capitalize"
								variant={getStatusBadgeVariant(turn.status)}
							>
								{turn.status}
							</Badge>
						</div>
					</div>

					<div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
						<span>stance {turn.primaryStance ?? "--"}</span>
						<span>protective L{turn.protectiveLevel ?? "--"}</span>
						<span>memory {turn.memoryCount}</span>
						<span>recall {turn.memoryRecallStrategy ?? "--"}</span>
						<span>pre-recall {turn.preRecallCount}</span>
						<span>tools {turn.toolCallCount}</span>
						{turn.hadToolRecall ? <span>tool recall</span> : null}
						{turn.hadToolFailures ? <span>tool failures</span> : null}
					</div>
				</CardContent>
			</Card>
		</button>
	);
}

function SpanSummary({ span }: { span: RuntimeSpan }) {
	const input = asRecord(span.input);
	const output = asRecord(span.output);
	const error = asRecord(span.error);

	if (span.stage === "signal_normalization") {
		const topSignals = asRecordArray(output?.topSignals);
		const signalDrivers = topSignals.filter(
			(signal) => getString(signal, "consumptionMode") !== "observe"
		);

		return (
			<div className="space-y-3">
				<div className="grid gap-3 sm:grid-cols-3">
					<SummaryItem
						label="Total Signals"
						value={
							getNumber(output, "totalSignalCount") === null
								? "--"
								: String(getNumber(output, "totalSignalCount"))
						}
					/>
					<SummaryItem
						label="Decision Inputs"
						value={
							getNumber(output, "decisionSignalCount") === null
								? "--"
								: String(getNumber(output, "decisionSignalCount"))
						}
					/>
					<SummaryItem
						label="Context Hints"
						value={
							getNumber(output, "contextHintSignalCount") === null
								? "--"
								: String(getNumber(output, "contextHintSignalCount"))
						}
					/>
					<SummaryItem
						label="Strong"
						value={
							getNumber(output, "strongSignalCount") === null
								? "--"
								: String(getNumber(output, "strongSignalCount"))
						}
					/>
					<SummaryItem
						label="Medium"
						value={
							getNumber(output, "mediumSignalCount") === null
								? "--"
								: String(getNumber(output, "mediumSignalCount"))
						}
					/>
					<SummaryItem
						label="Weak"
						value={
							getNumber(output, "weakSignalCount") === null
								? "--"
								: String(getNumber(output, "weakSignalCount"))
						}
					/>
				</div>

				<div className="space-y-2">
					<SectionLabel>Decision Drivers</SectionLabel>
					<SignalDriverBadges signals={signalDrivers} />
				</div>

				<div className="space-y-2">
					<SectionLabel>Top Signals</SectionLabel>
					<SignalDriverBadges signals={topSignals} />
				</div>
			</div>
		);
	}

	if (span.stage === "retrieval_signals") {
		const temporalActivation = asRecord(output?.temporalActivation);
		const query = asRecord(output?.temporalQuery);
		const strategy = getString(temporalActivation, "mode");
		const score = getNumber(temporalActivation, "score");
		const reasons = asStringArray(temporalActivation?.reasons);
		const expandedQuery = getString(query, "query") ?? "--";
		const targetPools = asStringArray(query?.targetPools);

		return (
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					{strategy ? (
						<Badge
							className="capitalize"
							variant={getStrategyBadgeVariant(strategy)}
						>
							{strategy}
						</Badge>
					) : null}
					{score === null ? null : (
						<Badge variant="outline">score {score.toFixed(2)}</Badge>
					)}
					{getBoolean(output, "toolFallbackAvailable") === null ? null : (
						<Badge variant="outline">
							tool fallback{" "}
							{getBoolean(output, "toolFallbackAvailable") ? "yes" : "no"}
						</Badge>
					)}
				</div>

				<div className="grid gap-3 sm:grid-cols-2">
					<SummaryItem label="Expanded Query" value={expandedQuery ?? "--"} />
					<SummaryItem
						label="Target Pools"
						value={targetPools.length > 0 ? targetPools.join(", ") : "--"}
					/>
				</div>

				<div className="space-y-2">
					<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
						Reasons
					</p>
					<ReasonBadges reasons={reasons} />
				</div>
			</div>
		);
	}

	if (span.stage === "temporal_recall") {
		const memoryCount = getNumber(output, "memoryCount");
		const reason = getString(output, "reason");
		const query = asRecord(input?.query ?? output?.query);
		const expandedQuery = getString(query, "query") ?? "--";

		return (
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<Badge
						className="capitalize"
						variant={getStatusBadgeVariant(span.status)}
					>
						{span.status}
					</Badge>
					{memoryCount === null ? null : (
						<Badge variant="outline">memory hits {memoryCount}</Badge>
					)}
					{reason ? <Badge variant="outline">{reason}</Badge> : null}
				</div>

				<SummaryItem label="Recall Query" value={expandedQuery ?? "--"} />
			</div>
		);
	}

	if (span.stage === "graph_recall") {
		const query = asRecord(input?.query);
		const seedTerms = asStringArray(query?.seedTerms);
		const seedNodeCount = getNumber(output, "seedNodeCount");
		const traversedEdgeCount = getNumber(output, "traversedEdgeCount");
		const returnedItemCount = getNumber(output, "returnedItemCount");
		const reason = getString(output, "reason");

		return (
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<Badge
						className="capitalize"
						variant={getStatusBadgeVariant(span.status)}
					>
						{span.status}
					</Badge>
					{returnedItemCount === null ? null : (
						<Badge variant="outline">returned {returnedItemCount}</Badge>
					)}
					{reason ? <Badge variant="outline">{reason}</Badge> : null}
				</div>

				<div className="grid gap-3 sm:grid-cols-3">
					<SummaryItem
						label="Seed Terms"
						value={seedTerms.length > 0 ? seedTerms.join(", ") : "--"}
					/>
					<SummaryItem
						label="Seed Nodes"
						value={seedNodeCount === null ? "--" : String(seedNodeCount)}
					/>
					<SummaryItem
						label="Edges"
						value={
							traversedEdgeCount === null ? "--" : String(traversedEdgeCount)
						}
					/>
				</div>
			</div>
		);
	}

	if (span.stage === "knowledge_recall") {
		const query = asRecord(input?.query);
		const rawQuery = getString(query, "query");
		const keywords = asStringArray(query?.keywords);
		const keywordHitCount = getNumber(output, "keywordHitCount");
		const vectorHitCount = getNumber(output, "vectorHitCount");
		const returnedItemCount = getNumber(output, "returnedItemCount");
		const reason = getString(output, "reason");

		return (
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<Badge
						className="capitalize"
						variant={getStatusBadgeVariant(span.status)}
					>
						{span.status}
					</Badge>
					{returnedItemCount === null ? null : (
						<Badge variant="outline">returned {returnedItemCount}</Badge>
					)}
					{reason ? <Badge variant="outline">{reason}</Badge> : null}
				</div>

				<div className="grid gap-3 sm:grid-cols-2">
					<SummaryItem label="Query" value={rawQuery ?? "--"} />
					<SummaryItem
						label="Keywords"
						value={keywords.length > 0 ? keywords.join(", ") : "--"}
					/>
					<SummaryItem
						label="Keyword Hits"
						value={keywordHitCount === null ? "--" : String(keywordHitCount)}
					/>
					<SummaryItem
						label="Vector Hits"
						value={vectorHitCount === null ? "--" : String(vectorHitCount)}
					/>
				</div>
			</div>
		);
	}

	if (span.stage === "working_memory_build") {
		const constraints = asRecordArray(output?.constraints);
		const actionCandidates = sortRecordsByScore(
			asRecordArray(output?.actionCandidates)
		);
		const signalDrivers = asRecordArray(output?.signalDrivers);

		return (
			<div className="space-y-3">
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<SummaryItem
						label="Focus"
						value={formatToken(getString(output, "focus"))}
					/>
					<SummaryItem
						label="Constraints"
						value={
							getNumber(output, "constraintCount") === null
								? "--"
								: String(getNumber(output, "constraintCount"))
						}
					/>
					<SummaryItem
						label="Action Candidates"
						value={
							getNumber(output, "actionCandidateCount") === null
								? "--"
								: String(getNumber(output, "actionCandidateCount"))
						}
					/>
					<SummaryItem
						label="Open Loops"
						value={
							getNumber(output, "openLoopCount") === null
								? "--"
								: String(getNumber(output, "openLoopCount"))
						}
					/>
				</div>

				<InsightList
					items={constraints.map((constraint, index) => ({
						id: `${getString(constraint, "kind") ?? "constraint"}-${index}`,
						label: formatToken(getString(constraint, "kind")),
						content: getString(constraint, "content") ?? "--",
						meta: `sources ${asStringArray(constraint.sourceIds).length}`,
					}))}
					title="Constraints"
				/>

				<InsightList
					items={actionCandidates.slice(0, 4).map((candidate, index) => ({
						id: `${getString(candidate, "kind") ?? "action"}-${index}`,
						label: formatToken(getString(candidate, "kind")),
						content: getString(candidate, "content") ?? "--",
						meta: `score ${formatScore(getNumber(candidate, "score"))} · sources ${asStringArray(candidate.sourceIds).length}`,
					}))}
					title="Action Candidates"
				/>

				<div className="space-y-2">
					<SectionLabel>Signal Drivers</SectionLabel>
					<SignalDriverBadges signals={signalDrivers} />
				</div>
			</div>
		);
	}

	if (span.stage === "tool_call") {
		const result = asRecord(output?.result);
		const toolName =
			getString(input, "toolName") ??
			getString(output, "toolName") ??
			getString(result, "toolName") ??
			getString(error, "toolName");
		const toolCallId =
			getString(input, "toolCallId") ??
			getString(output, "toolCallId") ??
			getString(error, "toolCallId");
		const duration =
			getNumber(output, "durationMs") ?? getNumber(error, "durationMs");

		if (toolName === "now") {
			const referenceNow = getString(result, "referenceNow");
			const localDisplay = getString(result, "localDisplay");
			const timeZone = getString(result, "timezone");

			return (
				<div className="space-y-3">
					<div className="grid gap-3 sm:grid-cols-3">
						<SummaryItem label="Tool" value={toolName} />
						<SummaryItem
							label="Duration"
							value={duration === null ? "--" : formatDuration(duration)}
						/>
						<SummaryItem label="Timezone" value={timeZone ?? "--"} />
						<SummaryItem label="Local Time" value={localDisplay ?? "--"} />
						<SummaryItem label="Reference Now" value={referenceNow ?? "--"} />
						<SummaryItem label="Call Id" value={toolCallId ?? "--"} />
					</div>
				</div>
			);
		}

		if (toolName === "create_reminder") {
			const scheduleId = getString(result, "scheduleId");
			const triggerAt = getString(result, "triggerAt");
			const localDisplay = getString(result, "localDisplay");

			return (
				<div className="grid gap-3 sm:grid-cols-3">
					<SummaryItem label="Tool" value={toolName} />
					<SummaryItem label="Schedule" value={scheduleId ?? "--"} />
					<SummaryItem
						label="Duration"
						value={duration === null ? "--" : formatDuration(duration)}
					/>
					<SummaryItem label="Trigger At" value={triggerAt ?? "--"} />
					<SummaryItem label="Local Time" value={localDisplay ?? "--"} />
					<SummaryItem label="Call Id" value={toolCallId ?? "--"} />
				</div>
			);
		}

		return (
			<div className="grid gap-3 sm:grid-cols-3">
				<SummaryItem label="Tool" value={toolName ?? "--"} />
				<SummaryItem label="Call Id" value={toolCallId ?? "--"} />
				<SummaryItem
					label="Duration"
					value={duration === null ? "--" : formatDuration(duration)}
				/>
			</div>
		);
	}

	if (span.stage === "response_spec_build") {
		const expressionContext = asRecord(output?.expressionContext);
		const signalDrivers = asRecordArray(output?.signalDrivers);
		const compiledExpressionSet = asRecord(output?.compiledExpressionSet);
		const rendererState = asRecord(output?.rendererState);
		const compiledTextExpression = asRecord(compiledExpressionSet?.text);
		const compiledVoiceExpression = asRecord(compiledExpressionSet?.voice);
		const compiledUiExpression = asRecord(compiledExpressionSet?.ui);
		const voiceRenderSpec = asRecord(rendererState?.voice);
		const uiRenderSpec = asRecord(rendererState?.ui);
		const tone = asStringArray(output?.tone);
		const mustAvoid = asStringArray(output?.mustAvoid);
		const renderHints = asStringArray(compiledTextExpression?.renderHints);
		const voiceHints = asStringArray(compiledVoiceExpression?.renderHints);
		const uiHints = asStringArray(compiledUiExpression?.renderHints);
		const suggestedActions = asRecordArray(uiRenderSpec?.suggestedActions);

		return (
			<div className="space-y-3">
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<SummaryItem
						label="Goal"
						value={formatToken(getString(output, "goal"))}
					/>
					<SummaryItem
						label="Stance"
						value={formatToken(getString(output, "stance"))}
					/>
					<SummaryItem
						label="Verbosity"
						value={formatToken(getString(output, "verbosity"))}
					/>
					<SummaryItem
						label="Tool Policy"
						value={formatToken(getString(output, "toolPolicy"))}
					/>
					<SummaryItem
						label="Ask Follow-up"
						value={formatBoolean(getBoolean(output, "shouldAskFollowup"))}
					/>
					<SummaryItem
						label="Suggest Action"
						value={formatBoolean(getBoolean(output, "shouldSuggestAction"))}
					/>
					<SummaryItem
						label="Intimacy Cap"
						value={formatToken(getString(output, "intimacyCap"))}
					/>
					<SummaryItem
						label="Compiler Focus"
						value={formatToken(
							getString(expressionContext, "workingMemoryFocus")
						)}
					/>
				</div>

				<div className="space-y-2">
					<SectionLabel>Compiler Context</SectionLabel>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<SummaryItem
							label="Intent"
							value={formatToken(getString(expressionContext, "userIntent"))}
						/>
						<SummaryItem
							label="Emotional Load"
							value={formatToken(getString(expressionContext, "emotionalLoad"))}
						/>
						<SummaryItem
							label="Vulnerability"
							value={formatToken(getString(expressionContext, "vulnerability"))}
						/>
						<SummaryItem
							label="Protective"
							value={
								getNumber(expressionContext, "protectiveLevel") === null
									? "--"
									: `L${getNumber(expressionContext, "protectiveLevel")}`
							}
						/>
					</div>
				</div>

				<div className="space-y-2">
					<SectionLabel>Compiled Text Plan</SectionLabel>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<SummaryItem
							label="Opening"
							value={formatToken(
								getString(compiledTextExpression, "openingMode")
							)}
						/>
						<SummaryItem
							label="Body"
							value={formatToken(getString(compiledTextExpression, "bodyMode"))}
						/>
						<SummaryItem
							label="Closing"
							value={formatToken(
								getString(compiledTextExpression, "closingMode")
							)}
						/>
						<SummaryItem
							label="Follow-up"
							value={formatToken(
								getString(compiledTextExpression, "followupMode")
							)}
						/>
						<SummaryItem
							label="Suggestion"
							value={formatToken(
								getString(compiledTextExpression, "suggestionMode")
							)}
						/>
						<SummaryItem
							label="Tool Use"
							value={formatToken(
								getString(compiledTextExpression, "toolUseMode")
							)}
						/>
					</div>
				</div>

				<div className="space-y-2">
					<SectionLabel>Compiled Voice Plan</SectionLabel>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<SummaryItem
							label="Cadence"
							value={formatToken(
								getString(compiledVoiceExpression, "cadenceMode")
							)}
						/>
						<SummaryItem
							label="Affect"
							value={formatToken(
								getString(compiledVoiceExpression, "affectMode")
							)}
						/>
						<SummaryItem
							label="Pause Density"
							value={formatToken(
								getString(compiledVoiceExpression, "pauseDensity")
							)}
						/>
						<SummaryItem
							label="Repair Mode"
							value={formatToken(
								getString(compiledVoiceExpression, "repairMode")
							)}
						/>
					</div>
				</div>

				<div className="space-y-2">
					<SectionLabel>Compiled UI Plan</SectionLabel>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<SummaryItem
							label="Frame"
							value={formatToken(
								getString(compiledUiExpression, "messageFrame")
							)}
						/>
						<SummaryItem
							label="CTA"
							value={formatToken(getString(compiledUiExpression, "ctaMode"))}
						/>
						<SummaryItem
							label="Card Density"
							value={formatToken(
								getString(compiledUiExpression, "cardDensity")
							)}
						/>
						<SummaryItem
							label="Alert"
							value={formatToken(getString(compiledUiExpression, "alertStyle"))}
						/>
					</div>
				</div>

				<div className="space-y-2">
					<SectionLabel>Voice Render Spec</SectionLabel>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<SummaryItem
							label="Style"
							value={formatToken(getString(voiceRenderSpec, "stylePreset"))}
						/>
						<SummaryItem
							label="Rate"
							value={
								getNumber(voiceRenderSpec, "speakingRate") === null
									? "--"
									: String(getNumber(voiceRenderSpec, "speakingRate"))
							}
						/>
						<SummaryItem
							label="Pause"
							value={
								getNumber(voiceRenderSpec, "pauseMs") === null
									? "--"
									: `${getNumber(voiceRenderSpec, "pauseMs")}ms`
							}
						/>
						<SummaryItem
							label="Boundary"
							value={formatToken(getString(voiceRenderSpec, "boundaryMode"))}
						/>
					</div>
				</div>

				<div className="space-y-2">
					<SectionLabel>UI Render Spec</SectionLabel>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<SummaryItem
							label="Bubble"
							value={formatToken(getString(uiRenderSpec, "bubbleVariant"))}
						/>
						<SummaryItem
							label="Alert"
							value={formatToken(getString(uiRenderSpec, "alertTone"))}
						/>
						<SummaryItem
							label="Placeholder"
							value={getString(uiRenderSpec, "composerPlaceholder") ?? "--"}
						/>
						<SummaryItem
							label="Suggested Actions"
							value={String(suggestedActions.length)}
						/>
					</div>
				</div>

				<div className="space-y-2">
					<SectionLabel>Tone Directives</SectionLabel>
					<ReasonBadges reasons={tone} />
				</div>

				<div className="space-y-2">
					<SectionLabel>Forbidden Moves</SectionLabel>
					<ReasonBadges reasons={mustAvoid} />
				</div>

				<div className="space-y-2">
					<SectionLabel>Render Hints</SectionLabel>
					<ReasonBadges reasons={renderHints} />
				</div>

				<div className="space-y-2">
					<SectionLabel>Voice Hints</SectionLabel>
					<ReasonBadges reasons={voiceHints} />
				</div>

				<div className="space-y-2">
					<SectionLabel>UI Hints</SectionLabel>
					<ReasonBadges reasons={uiHints} />
				</div>

				<div className="space-y-2">
					<SectionLabel>Signal Drivers</SectionLabel>
					<SignalDriverBadges signals={signalDrivers} />
				</div>
			</div>
		);
	}

	if (span.stage === "prompt_compile") {
		const promptSections = asRecordArray(output?.promptSections);
		const channels = asStringArray(output?.compiledExpressionChannels);

		return (
			<div className="space-y-3">
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<SummaryItem
						label="Prompt Length"
						value={
							getNumber(output, "systemPromptLength") === null
								? "--"
								: String(getNumber(output, "systemPromptLength"))
						}
					/>
					<SummaryItem
						label="Sections"
						value={
							getNumber(output, "promptSectionCount") === null
								? "--"
								: String(getNumber(output, "promptSectionCount"))
						}
					/>
					<SummaryItem
						label="Working Memory Items"
						value={
							getNumber(output, "workingMemoryCount") === null
								? "--"
								: String(getNumber(output, "workingMemoryCount"))
						}
					/>
					<SummaryItem
						label="Expression Channels"
						value={channels.length > 0 ? channels.join(", ") : "--"}
					/>
				</div>

				<InsightList
					items={promptSections.map((section, index) => ({
						id: `${getString(section, "key") ?? "section"}-${index}`,
						label: formatToken(getString(section, "key")),
						content: getString(section, "title") ?? "--",
						meta:
							getNumber(section, "bodyLength") === null
								? undefined
								: `${getNumber(section, "bodyLength")} chars`,
					}))}
					title="Prompt Sections"
				/>
			</div>
		);
	}

	if (span.stage === "provider_stream") {
		const providerOutcome = getString(output, "providerOutcome");

		return (
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<Badge
						className="capitalize"
						variant={getStatusBadgeVariant(span.status)}
					>
						{span.status}
					</Badge>
					{providerOutcome ? (
						<Badge variant="outline">{providerOutcome}</Badge>
					) : null}
				</div>

				<div className="grid gap-3 sm:grid-cols-3">
					<SummaryItem
						label="First Token"
						value={formatTimestamp(getString(output, "firstTokenAt"))}
					/>
					<SummaryItem
						label="Finish Reason"
						value={getString(output, "finishReason") ?? "--"}
					/>
					<SummaryItem
						label="Content Length"
						value={
							getNumber(output, "contentLength") === null
								? "--"
								: String(getNumber(output, "contentLength"))
						}
					/>
				</div>
			</div>
		);
	}

	if (span.stage === "soul_runtime" || span.stage === "soul_decision") {
		const appraisal = asRecord(output?.appraisal);
		const protectiveDecision = asRecord(output?.protectiveDecision);
		const stanceDecision = asRecord(output?.stanceDecision);
		const signalDrivers = asRecordArray(output?.signalDrivers);
		const effectiveDriveOrder = asStringArray(output?.effectiveDriveOrder);
		const protectiveReasons = asStringArray(protectiveDecision?.reasons);
		const blocked = asStringArray(stanceDecision?.blocked);

		return (
			<div className="space-y-3">
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<SummaryItem
						label="Intent"
						value={formatToken(getString(appraisal, "userIntent"))}
					/>
					<SummaryItem
						label="Emotional Load"
						value={formatToken(getString(appraisal, "emotionalLoad"))}
					/>
					<SummaryItem
						label="Vulnerability"
						value={formatToken(getString(appraisal, "vulnerability"))}
					/>
					<SummaryItem
						label="Detected Emotion"
						value={formatToken(getString(appraisal, "detectedEmotion"))}
					/>
					<SummaryItem
						label="Protective"
						value={
							getNumber(protectiveDecision, "level") === null
								? "--"
								: `L${getNumber(protectiveDecision, "level")}`
						}
					/>
					<SummaryItem
						label="Primary Stance"
						value={formatToken(getString(stanceDecision, "primary"))}
					/>
					<SummaryItem
						label="Needs Comfort"
						value={formatBoolean(getBoolean(appraisal, "needsComfort"))}
					/>
					<SummaryItem
						label="Ready For Progress"
						value={formatBoolean(getBoolean(appraisal, "readyForProgress"))}
					/>
				</div>

				<div className="space-y-2">
					<SectionLabel>Protective Reasons</SectionLabel>
					<ReasonBadges reasons={protectiveReasons} />
				</div>

				<div className="space-y-2">
					<SectionLabel>Effective Drives</SectionLabel>
					<ReasonBadges reasons={effectiveDriveOrder} />
				</div>

				{blocked.length > 0 ? (
					<div className="space-y-2">
						<SectionLabel>Blocked Moves</SectionLabel>
						<ReasonBadges reasons={blocked} />
					</div>
				) : null}

				<div className="space-y-2">
					<SectionLabel>Signal Drivers</SectionLabel>
					<SignalDriverBadges signals={signalDrivers} />
				</div>
			</div>
		);
	}

	return null;
}

function SpanCard({ span }: { span: RuntimeSpan }) {
	const expandProviderPayload = span.stage === "provider_stream";

	return (
		<Card>
			<CardContent>
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="font-medium text-sm">
							{stageLabel[span.stage] ?? span.stage}
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							seq {span.seq} · {formatTimestamp(span.startedAt)} ·{" "}
							{formatDuration(span.durationMs)}
						</p>
					</div>
					<Badge
						className="capitalize"
						variant={getStatusBadgeVariant(span.status)}
					>
						{span.status}
					</Badge>
				</div>

				<div className="mt-4 space-y-4">
					<SpanSummary span={span} />
					<JsonBlock
						defaultOpen={expandProviderPayload}
						title="Input"
						value={span.input}
					/>
					<JsonBlock
						defaultOpen={expandProviderPayload}
						title="Output"
						value={span.output}
					/>
					<JsonBlock title="Error" value={span.error} />
				</div>
			</CardContent>
		</Card>
	);
}

function RuntimeTimelinePage({ conversationId, initialTurnId = null }: Props) {
	const [selectedTurnIdState, setSelectedTurnId] = useState<string | null>(
		null
	);

	const turnsQuery = useQuery({
		queryKey: ["runtime-turns", conversationId],
		queryFn: async () => api.runtime.listTurns({ conversationId }),
		refetchInterval: (query) => {
			const turns = query.state.data;
			return turns?.some((turn) => turn.status === "running") ? 1000 : false;
		},
	});

	const turns = turnsQuery.data ?? [];
	const selectedTurnId =
		selectedTurnIdState && turns.some((turn) => turn.id === selectedTurnIdState)
			? selectedTurnIdState
			: initialTurnId && turns.some((turn) => turn.id === initialTurnId)
				? initialTurnId
				: (turns[0]?.id ?? null);
	const selectedTurn = turns.find((turn) => turn.id === selectedTurnId) ?? null;

	const turnDetailQuery = useQuery({
		enabled: selectedTurnId !== null,
		queryKey: ["runtime-turn", selectedTurnId],
		queryFn: async () =>
			selectedTurnId === null
				? null
				: await api.runtime.getTurn({ turnId: selectedTurnId }),
		refetchInterval: selectedTurn?.status === "running" ? 1000 : false,
	});

	const spansQuery = useQuery({
		enabled: selectedTurnId !== null,
		queryKey: ["runtime-spans", selectedTurnId],
		queryFn: async () =>
			selectedTurnId === null
				? []
				: runtimeSpanSchema
						.array()
						.parse(await api.runtime.listTurnSpans({ turnId: selectedTurnId })),
		refetchInterval: selectedTurn?.status === "running" ? 1000 : false,
	});

	const activeTurn = turnDetailQuery.data ?? selectedTurn;

	return (
		<div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[300px_1fr]">
			<ScrollArea className="border-border/60 border-b lg:border-r lg:border-b-0">
				<div className="space-y-3 p-4">
					<div className="flex items-center justify-between">
						<p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.12em]">
							Turns
						</p>
						{turnsQuery.isFetching ? (
							<Spinner className="size-4 text-muted-foreground" />
						) : null}
					</div>

					{turnsQuery.isLoading ? (
						<div className="flex items-center justify-center py-10">
							<Spinner className="size-5 text-muted-foreground" />
						</div>
					) : null}

					{turnsQuery.data?.length === 0 ? (
						<Card>
							<CardContent className="py-6 text-muted-foreground text-sm">
								这个对话还没有 runtime turn。
							</CardContent>
						</Card>
					) : null}

					{turnsQuery.data?.map((turn) => (
						<TurnCard
							key={turn.id}
							onSelect={() => setSelectedTurnId(turn.id)}
							selected={turn.id === selectedTurnId}
							turn={turn}
						/>
					))}
				</div>
			</ScrollArea>

			<ScrollArea className="min-h-0">
				<div className="space-y-6 p-5">
					{activeTurn ? (
						<>
							<Card>
								<CardContent className="space-y-4">
									<div className="flex flex-wrap items-center gap-2">
										<Badge
											className="capitalize"
											variant={getStatusBadgeVariant(activeTurn.status)}
										>
											{activeTurn.status}
										</Badge>
										<Badge variant="outline">
											provider {activeTurn.providerKey}
										</Badge>
										<Badge variant="outline">model {activeTurn.modelKey}</Badge>
									</div>

									<div className="grid gap-3 text-muted-foreground text-sm sm:grid-cols-2 xl:grid-cols-3">
										<div>started {formatTimestamp(activeTurn.startedAt)}</div>
										<div>ended {formatTimestamp(activeTurn.endedAt)}</div>
										<div>duration {formatDuration(activeTurn.durationMs)}</div>
										<div>stance {activeTurn.primaryStance ?? "--"}</div>
										<div>protective L{activeTurn.protectiveLevel ?? "--"}</div>
										<div>memory hits {activeTurn.memoryCount}</div>
										<div>recall {activeTurn.memoryRecallStrategy ?? "--"}</div>
										<div>pre-recall {activeTurn.preRecallCount}</div>
										<div>tool calls {activeTurn.toolCallCount}</div>
										<div>
											tool recall {activeTurn.hadToolRecall ? "yes" : "no"}
										</div>
										<div>
											tool failures {activeTurn.hadToolFailures ? "yes" : "no"}
										</div>
										<div>turn {activeTurn.id.slice(0, 8)}</div>
									</div>

									<JsonBlock title="Turn Error" value={activeTurn.errorJson} />
								</CardContent>
							</Card>

							<div className="flex items-center justify-between">
								<p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.12em]">
									Spans
								</p>
								<Button
									onClick={() => {
										turnsQuery.refetch();
										turnDetailQuery.refetch();
										spansQuery.refetch();
									}}
									size="sm"
									variant="ghost"
								>
									Refresh
								</Button>
							</div>

							<Separator />

							{spansQuery.isLoading ? (
								<div className="flex items-center justify-center py-10">
									<Spinner className="size-5 text-muted-foreground" />
								</div>
							) : null}

							<div className="space-y-4">
								{spansQuery.data?.map((span) => (
									<SpanCard key={span.id} span={span} />
								))}
							</div>
						</>
					) : (
						<Card>
							<CardContent className="py-8 text-muted-foreground text-sm">
								选择一个 turn 查看详细 timeline。
							</CardContent>
						</Card>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}

export { RuntimeTimelinePage };
