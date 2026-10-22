import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@neobuni/ui/components/accordion";
import { Badge } from "@neobuni/ui/components/badge";
import { Card, CardContent } from "@neobuni/ui/components/card";

type Props = {
	label: string;
	value: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isPrimitive = (value: unknown) =>
	value === null ||
	value === undefined ||
	typeof value === "string" ||
	typeof value === "number" ||
	typeof value === "boolean";

const maybeParseJson = (value: unknown): unknown => {
	if (typeof value !== "string") {
		return value;
	}

	const trimmed = value.trim();
	if (
		!(
			(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
			(trimmed.startsWith("[") && trimmed.endsWith("]"))
		)
	) {
		return value;
	}

	try {
		return JSON.parse(trimmed) as unknown;
	} catch {
		return value;
	}
};

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const describeNestedValue = (value: unknown) => {
	if (Array.isArray(value)) {
		return `数组 (${value.length})`;
	}

	if (isRecord(value)) {
		return `对象 (${Object.keys(value).length})`;
	}

	return "查看详情";
};

function ScalarValue({ value }: { value: unknown }) {
	if (value === null || value === undefined) {
		return <span className="text-muted-foreground">--</span>;
	}

	if (typeof value === "boolean") {
		return <span>{value ? "true" : "false"}</span>;
	}

	return <span className="break-all">{String(value)}</span>;
}

function NestedValue({
	value,
	itemValue,
}: {
	value: unknown;
	itemValue: string;
}) {
	return (
		<Accordion defaultValue={[]}>
			<AccordionItem className="border-none" value={itemValue}>
				<AccordionTrigger className="rounded-xl px-0 py-1 text-xs hover:no-underline">
					<span className="text-muted-foreground">
						{describeNestedValue(value)}
					</span>
				</AccordionTrigger>
				<AccordionContent className="pt-2">
					<pre className="overflow-x-auto rounded-lg border border-border/60 p-3 text-[11px] text-foreground leading-5">
						{prettyJson(value)}
					</pre>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}

function StructuredDataBlock({ label, value }: Props) {
	const normalized = maybeParseJson(value);

	if (normalized === null || normalized === undefined || normalized === "") {
		return null;
	}

	if (isPrimitive(normalized)) {
		return (
			<Card size="sm">
				<CardContent className="space-y-2">
					<div className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
						{label}
					</div>
					<div className="text-foreground text-sm">
						<ScalarValue value={normalized} />
					</div>
				</CardContent>
			</Card>
		);
	}

	if (Array.isArray(normalized) && normalized.every(isPrimitive)) {
		return (
			<Card size="sm">
				<CardContent className="space-y-2">
					<div className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
						{label}
					</div>
					<div className="flex flex-wrap gap-2 text-foreground text-sm">
						{normalized.map((item, index) => (
							<Badge key={`${label}-${index}`} variant="outline">
								<ScalarValue value={item} />
							</Badge>
						))}
					</div>
				</CardContent>
			</Card>
		);
	}

	const entries = Array.isArray(normalized)
		? normalized.map((item, index) => [String(index), item] as const)
		: Object.entries(normalized);

	return (
		<Card size="sm">
			<CardContent className="space-y-3">
				<div className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
					{label}
				</div>
				<div className="flex flex-col gap-2">
					{entries.map(([key, item]) => (
						<Card key={`${label}-${key}`} size="sm">
							<CardContent className="space-y-1">
								<div className="font-medium text-[11px] text-muted-foreground">
									{key}
								</div>
								<div className="text-foreground text-sm">
									{isPrimitive(item) ? (
										<ScalarValue value={item} />
									) : (
										<NestedValue itemValue={`${label}-${key}`} value={item} />
									)}
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

export { StructuredDataBlock };
