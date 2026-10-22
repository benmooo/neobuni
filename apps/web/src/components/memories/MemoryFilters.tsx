import { Input } from "@neobuni/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@neobuni/ui/components/select";
import { Switch } from "@neobuni/ui/components/switch";
import { Funnel, MagnifyingGlass } from "@phosphor-icons/react";

import type { MemoryType } from "../../hooks/use-memories";

type Filters = {
	type?: MemoryType;
	unresolved?: boolean;
	search: string;
};

type Props = {
	filters: Filters;
	onChange: (filters: Filters) => void;
};

const TYPE_OPTIONS: Array<{ value: MemoryType | "all"; label: string }> = [
	{ value: "all", label: "全部类型" },
	{ value: "event", label: "事件" },
	{ value: "thought", label: "想法" },
	{ value: "preference", label: "偏好" },
	{ value: "fact", label: "事实" },
	{ value: "task", label: "待办" },
];

function MemoryFilters({ filters, onChange }: Props) {
	return (
		<div className="flex flex-col gap-3 px-4 py-3">
			{/* Search */}
			<div className="relative">
				<MagnifyingGlass
					className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
					size={16}
				/>
				<Input
					className="rounded-xl pl-9"
					onChange={(e) => onChange({ ...filters, search: e.target.value })}
					placeholder="搜索记忆..."
					value={filters.search}
				/>
			</div>

			{/* Type + unresolved */}
			<div className="flex items-center gap-3">
				<Select
					onValueChange={(v) =>
						onChange({
							...filters,
							type: v === "all" ? undefined : (v as MemoryType),
						})
					}
					value={filters.type ?? "all"}
				>
					<SelectTrigger className="h-8 w-32 rounded-xl text-xs">
						<Funnel className="mr-1" size={13} />
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TYPE_OPTIONS.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<label className="flex items-center gap-2 text-muted-foreground text-xs">
					<Switch
						checked={filters.unresolved ?? false}
						onCheckedChange={(v) =>
							onChange({
								...filters,
								unresolved: v ? true : undefined,
							})
						}
					/>
					仅未解决
				</label>
			</div>
		</div>
	);
}

export type { Filters };
export { MemoryFilters };
