import { AuiIf, ComposerPrimitive, useAui } from "@assistant-ui/react";
import type { UiRenderSpec } from "@neobuni/contracts";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@neobuni/ui/components/alert";
import { Button, buttonVariants } from "@neobuni/ui/components/button";
import { Card, CardContent } from "@neobuni/ui/components/card";
import { cn } from "@neobuni/ui/lib/utils";
import { PaperPlaneTilt, Stop } from "@phosphor-icons/react";

type Props = {
	uiRenderSpec?: UiRenderSpec | null;
};

const getAlertRenderSpec = (uiRenderSpec: UiRenderSpec | null) =>
	!uiRenderSpec ||
	uiRenderSpec.alertTone === "none" ||
	uiRenderSpec.alertTone === "protective"
		? null
		: uiRenderSpec;

function AssistantUiComposer({ uiRenderSpec = null }: Props) {
	const aui = useAui();
	const alertRenderSpec = getAlertRenderSpec(uiRenderSpec);
	const actionRenderSpec =
		uiRenderSpec && uiRenderSpec.suggestedActions.length > 0
			? uiRenderSpec
			: null;

	const sendSuggestedAction = (prompt: string) => {
		aui.composer().setText(prompt);
		aui.composer().send();
	};

	return (
		<div className="mx-auto w-full px-4">
			<div className="flex flex-col gap-3">
				{alertRenderSpec ? (
					<Alert>
						{alertRenderSpec.alertTitle ? (
							<AlertTitle>{alertRenderSpec.alertTitle}</AlertTitle>
						) : null}
						{alertRenderSpec.alertBody ? (
							<AlertDescription>{alertRenderSpec.alertBody}</AlertDescription>
						) : null}
					</Alert>
				) : null}

				{actionRenderSpec ? (
					<div className="flex flex-wrap gap-2">
						{actionRenderSpec.suggestedActions.map((action) => (
							<Button
								className="rounded-full"
								key={action.id}
								onClick={() => sendSuggestedAction(action.prompt)}
								size="sm"
								type="button"
								variant="outline"
							>
								{action.label}
							</Button>
						))}
					</div>
				) : null}

				<Card className="p-0!" size="sm">
					<CardContent className="p-2!">
						<ComposerPrimitive.Root className="flex flex-col">
							<ComposerPrimitive.Input
								className="min-h-12 w-full resize-none p-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60"
								placeholder={uiRenderSpec?.composerPlaceholder ?? "说点什么…"}
								rows={1}
							/>

							<div className="flex items-center justify-end px-2 pb-2">
								<AuiIf condition={(state) => !state.thread.isRunning}>
									<ComposerPrimitive.Send
										className={cn(
											buttonVariants({ size: "icon-sm" }),
											"rounded-full"
										)}
									>
										<PaperPlaneTilt size={16} weight="fill" />
									</ComposerPrimitive.Send>
								</AuiIf>

								<AuiIf condition={(state) => state.thread.isRunning}>
									<ComposerPrimitive.Cancel
										className={cn(
											buttonVariants({ size: "icon-sm", variant: "outline" }),
											"rounded-full"
										)}
									>
										<Stop size={14} weight="fill" />
									</ComposerPrimitive.Cancel>
								</AuiIf>
							</div>
						</ComposerPrimitive.Root>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export { AssistantUiComposer };
