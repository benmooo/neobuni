import { Badge } from "@neobuni/ui/components/badge";
import { Button } from "@neobuni/ui/components/button";
import { Card, CardContent } from "@neobuni/ui/components/card";
import { PencilSimple, Trash, Warning } from "@phosphor-icons/react";

type Memory = {
	id: string;
	content: string;
	type: string;
	keywords: string[];
	importance: number;
	unresolved: boolean;
	createdAt: string;
};

type Props = {
	memory: Memory;
	onEdit: (memory: Memory) => void;
	onDelete: (id: string) => void;
};

const TYPE_LABELS: Record<string, string> = {
	event: "事件",
	thought: "想法",
	preference: "偏好",
	fact: "事实",
	task: "待办",
};

const TYPE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
	event: "outline",
	thought: "outline",
	preference: "secondary",
	fact: "default",
	task: "outline",
};

const formatDate = (iso: string) =>
	new Intl.DateTimeFormat("zh-CN", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(iso));

function MemoryCard({ memory, onEdit, onDelete }: Props) {
	return (
		<Card className="transition-colors hover:border-border">
			<CardContent>
				{/* Header: type badge + importance + unresolved */}
				<div className="flex items-center gap-2">
					<Badge variant={TYPE_VARIANTS[memory.type] ?? "outline"}>
						{TYPE_LABELS[memory.type] ?? memory.type}
					</Badge>

					<Badge variant="outline">
						重要度 {(memory.importance * 100).toFixed(0)}%
					</Badge>

					{memory.unresolved && (
						<Badge variant="destructive">
							<Warning size={14} weight="fill" />
							未解决
						</Badge>
					)}

					<div className="ml-auto flex gap-1">
						<Button
							className="rounded-lg text-muted-foreground"
							onClick={() => onEdit(memory)}
							size="icon-sm"
							variant="ghost"
						>
							<PencilSimple size={14} />
						</Button>
						<Button
							className="rounded-lg text-muted-foreground hover:text-destructive"
							onClick={() => onDelete(memory.id)}
							size="icon-sm"
							variant="ghost"
						>
							<Trash size={14} />
						</Button>
					</div>
				</div>

				{/* Content */}
				<p className="mt-2 text-foreground text-sm leading-relaxed">
					{memory.content}
				</p>

				{/* Keywords + date */}
				<div className="mt-3 flex flex-wrap items-center gap-1.5">
					{memory.keywords.map((kw) => (
						<Badge
							className="rounded-lg font-normal text-[10px]"
							key={kw}
							variant="secondary"
						>
							{kw}
						</Badge>
					))}
					<span className="ml-auto text-[10px] text-muted-foreground">
						{formatDate(memory.createdAt)}
					</span>
				</div>
			</CardContent>
		</Card>
	);
}

export type { Memory };
export { MemoryCard };
