import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@neobuni/ui/components/accordion";
import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import { Badge } from "@neobuni/ui/components/badge";
import { Button } from "@neobuni/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@neobuni/ui/components/card";
import { Spinner } from "@neobuni/ui/components/spinner";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { TaskRunTracePanel } from "@/components/runtime/TaskRunTracePanel";
import {
	getTaskRunStatusLabel,
	getTaskRunStatusVariant,
	resolveTaskRunErrorMessage,
	resolveTaskRunResultPreview,
} from "@/features/schedules/view-model";
import { useTaskRunTrace } from "@/hooks/use-schedules";

export const Route = createFileRoute("/_app/schedules/runs/$taskRunId")({
	component: TaskRunDetailPage,
});

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

function JsonPreview({
	title,
	value,
	itemValue,
}: {
	title: string;
	value: unknown;
	itemValue: string;
}) {
	if (value === null || value === undefined) {
		return null;
	}

	return (
		<Accordion defaultValue={[]}>
			<AccordionItem className="border-none" value={itemValue}>
				<AccordionTrigger className="py-0 text-muted-foreground text-xs hover:no-underline">
					{title}
				</AccordionTrigger>
				<AccordionContent className="pt-3">
					<Card size="sm">
						<CardContent>
							<pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-foreground">
								{prettyJson(value)}
							</pre>
						</CardContent>
					</Card>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}

function TaskRunDetailPage() {
	const { taskRunId } = Route.useParams();
	const traceQuery = useTaskRunTrace(taskRunId);
	const trace = traceQuery.data;
	const taskRun = trace?.taskRun ?? null;
	const runtimeTurn = trace?.runtimeTurn ?? null;
	const errorMessage = taskRun ? resolveTaskRunErrorMessage(taskRun) : null;
	const resultPreview = taskRun ? resolveTaskRunResultPreview(taskRun) : null;

	return (
		<div className="flex h-screen flex-col">
			<PageHeader
				actions={
					<Button
						className="rounded-xl text-muted-foreground"
						disabled={traceQuery.isFetching}
						onClick={() => void traceQuery.refetch()}
						size="icon"
						variant="ghost"
					>
						<ArrowsClockwiseIcon
							className={traceQuery.isFetching ? "animate-spin" : undefined}
							size={20}
							weight="regular"
						/>
					</Button>
				}
				title={taskRun ? `Task Run ${taskRun.id.slice(0, 8)}` : "Task Run"}
			/>

			<div className="flex-1 overflow-y-auto px-4 pb-4">
				<div className="mt-4 flex flex-col gap-4">
					{traceQuery.isLoading ? (
						<div className="flex h-32 items-center justify-center">
							<Spinner className="size-5 text-muted-foreground" />
						</div>
					) : traceQuery.isError ? (
						<Alert variant="destructive">
							<AlertDescription>
								task run detail 读取失败：
								{traceQuery.error instanceof Error
									? traceQuery.error.message
									: "请稍后重试。"}
							</AlertDescription>
						</Alert>
					) : taskRun ? (
						<>
							<Card>
								<CardHeader className="pb-2">
									<div className="flex items-start justify-between gap-3">
										<div className="space-y-1">
											<CardTitle className="text-base">{taskRun.id}</CardTitle>
											<p className="text-muted-foreground text-sm">
												schedule {taskRun.scheduleId}
											</p>
										</div>
										<Badge variant={getTaskRunStatusVariant(taskRun.status)}>
											{getTaskRunStatusLabel(taskRun.status)}
										</Badge>
									</div>
								</CardHeader>
								<CardContent className="space-y-3">
									<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
										<div className="text-muted-foreground text-sm">
											scheduled{" "}
											<span className="text-foreground">
												{taskRun.scheduledFor}
											</span>
										</div>
										<div className="text-muted-foreground text-sm">
											attempt{" "}
											<span className="text-foreground">
												{taskRun.attempt} / {taskRun.maxAttempts}
											</span>
										</div>
										<div className="text-muted-foreground text-sm">
											started{" "}
											<span className="text-foreground">
												{taskRun.startedAt ?? "--"}
											</span>
										</div>
										<div className="text-muted-foreground text-sm">
											finished{" "}
											<span className="text-foreground">
												{taskRun.finishedAt ?? "--"}
											</span>
										</div>
										<div className="text-muted-foreground text-sm">
											runtime turn{" "}
											<span className="text-foreground">
												{taskRun.runtimeTurnId ?? "--"}
											</span>
										</div>
										<div className="text-muted-foreground text-sm">
											retry at{" "}
											<span className="text-foreground">
												{taskRun.nextRetryAt ?? "--"}
											</span>
										</div>
									</div>

									<div className="flex flex-wrap gap-2">
										<Link
											className="inline-flex items-center rounded-lg border border-border/60 px-3 py-2 text-foreground text-sm transition-colors hover:bg-muted"
											params={{ scheduleId: taskRun.scheduleId }}
											to="/schedules/$scheduleId"
										>
											返回 Schedule
										</Link>
										{runtimeTurn?.conversationId ? (
											<Link
												className="inline-flex items-center rounded-lg border border-border/60 px-3 py-2 text-foreground text-sm transition-colors hover:bg-muted"
												params={{ conversationId: runtimeTurn.conversationId }}
												search={{ turnId: runtimeTurn.id }}
												to="/chat/$conversationId/runtime"
											>
												打开 Conversation Runtime
											</Link>
										) : null}
									</div>
								</CardContent>
							</Card>

							{errorMessage ? (
								<Alert variant="destructive">
									<AlertDescription>{errorMessage}</AlertDescription>
								</Alert>
							) : null}

							{resultPreview ? (
								<Card>
									<CardHeader className="pb-2">
										<CardTitle className="text-base">
											Assistant Result
										</CardTitle>
									</CardHeader>
									<CardContent>
										<p className="whitespace-pre-wrap text-foreground text-sm">
											{resultPreview}
										</p>
									</CardContent>
								</Card>
							) : null}

							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-base">Execution Payload</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3">
									<JsonPreview
										itemValue="tool-policy-snapshot"
										title="Tool Policy Snapshot"
										value={taskRun.toolPolicySnapshot}
									/>
									<JsonPreview
										itemValue="input-snapshot"
										title="Input Snapshot"
										value={taskRun.inputSnapshot}
									/>
									<JsonPreview
										itemValue="result-json"
										title="Result JSON"
										value={taskRun.result}
									/>
									<JsonPreview
										itemValue="error-json"
										title="Error JSON"
										value={taskRun.error}
									/>
								</CardContent>
							</Card>

							<TaskRunTracePanel
								isLoading={traceQuery.isLoading}
								isRefreshing={traceQuery.isFetching}
								onRefresh={() => void traceQuery.refetch()}
								runtimeTurn={runtimeTurn}
								spans={trace?.spans ?? []}
							/>
						</>
					) : null}
				</div>
			</div>
		</div>
	);
}
