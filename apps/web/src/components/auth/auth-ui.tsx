import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import { buttonVariants } from "@neobuni/ui/components/button";
import { Separator } from "@neobuni/ui/components/separator";
import { cn } from "@neobuni/ui/lib/utils";
import type { ReactNode } from "react";

const authPrimaryActionClassName = cn(
	buttonVariants({ variant: "default", size: "lg" }),
	"h-12 w-full"
);

const authSecondaryActionClassName = cn(
	buttonVariants({ variant: "outline", size: "lg" }),
	"h-12 w-full"
);

const authInlineLinkClassName = buttonVariants({
	variant: "link",
	size: "default",
});

function AuthNotice({
	children,
	tone = "default",
}: {
	children: ReactNode;
	tone?: "default" | "destructive";
}) {
	return (
		<Alert variant={tone}>
			<AlertDescription>{children}</AlertDescription>
		</Alert>
	);
}

function AuthFooter({
	prompt,
	children,
}: {
	prompt?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="space-y-4">
			<Separator />
			<div className="flex items-center justify-between gap-4 text-muted-foreground text-sm">
				<div>{prompt}</div>
				<div className="flex items-center gap-2">{children}</div>
			</div>
		</div>
	);
}

export {
	AuthFooter,
	AuthNotice,
	authInlineLinkClassName,
	authPrimaryActionClassName,
	authSecondaryActionClassName,
};
