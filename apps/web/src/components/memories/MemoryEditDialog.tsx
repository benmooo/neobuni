import { Badge } from "@neobuni/ui/components/badge";
import { Button } from "@neobuni/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@neobuni/ui/components/dialog";
import { Input } from "@neobuni/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@neobuni/ui/components/select";
import { Slider } from "@neobuni/ui/components/slider";
import { Switch } from "@neobuni/ui/components/switch";
import { Textarea } from "@neobuni/ui/components/textarea";
import { X } from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { z } from "zod";

import {
	FormFieldBlock,
	FormToggleField,
} from "@/components/form/FormFieldBlock";
import { readValidationMessage } from "@/lib/form-errors";

import {
	type MemoryType,
	useCreateMemory,
	useUpdateMemory,
} from "../../hooks/use-memories";

type MemoryData = {
	id?: string;
	content: string;
	type: MemoryType;
	keywords: string[];
	importance: number;
	unresolved: boolean;
};

type Props = {
	open: boolean;
	onClose: () => void;
	initial?: MemoryData;
};

const TYPE_OPTIONS: Array<{ value: MemoryType; label: string }> = [
	{ value: "event", label: "事件" },
	{ value: "thought", label: "想法" },
	{ value: "preference", label: "偏好" },
	{ value: "fact", label: "事实" },
	{ value: "task", label: "待办" },
];

const memoryFormSchema = z.object({
	content: z.string().trim().min(1, "记忆内容不能为空。").max(8000),
	type: z.enum(["event", "thought", "preference", "fact", "task"]),
	keywords: z.array(z.string().trim().min(1)).max(10, "最多添加 10 个关键词。"),
	importance: z.number().min(0).max(1),
	unresolved: z.boolean(),
});

const getSliderValue = (
	values: number | number[] | readonly number[] | undefined,
	fallback: number
) => {
	if (Array.isArray(values)) {
		return values[0] ?? fallback;
	}

	if (typeof values === "number") {
		return values;
	}

	return fallback;
};

function MemoryEditDialog({ open, onClose, initial }: Props) {
	const isEditing = Boolean(initial?.id);
	const createMemory = useCreateMemory();
	const updateMemory = useUpdateMemory();
	const [keywordInput, setKeywordInput] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			content: initial?.content ?? "",
			type: initial?.type ?? "fact",
			keywords: initial?.keywords ?? [],
			importance: initial?.importance ?? 0.5,
			unresolved: initial?.unresolved ?? false,
		},
		validators: {
			onBlur: memoryFormSchema,
			onSubmit: memoryFormSchema,
		},
		onSubmit: async ({ value }) => {
			setSubmitError(null);

			try {
				if (isEditing && initial?.id) {
					await updateMemory.mutateAsync({ id: initial.id, ...value });
				} else {
					await createMemory.mutateAsync(value);
				}
				onClose();
			} catch (error) {
				setSubmitError(error instanceof Error ? error.message : "保存失败。");
			}
		},
	});

	const addKeyword = () => {
		const trimmed = keywordInput.trim();
		const keywords = form.state.values.keywords;

		if (!trimmed || keywords.includes(trimmed) || keywords.length >= 10) {
			return;
		}

		form.setFieldValue("keywords", [...keywords, trimmed]);
		setKeywordInput("");
	};

	return (
		<Dialog onOpenChange={(value) => !value && onClose()} open={open}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>{isEditing ? "编辑记忆" : "新建记忆"}</DialogTitle>
				</DialogHeader>

				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<form.Field name="content">
						{(field) => (
							<FormFieldBlock
								error={
									field.state.meta.isTouched
										? readValidationMessage(field.state.meta.errors)
										: null
								}
								label="记忆内容"
							>
								<Textarea
									autoFocus
									maxLength={8000}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									placeholder="记忆内容..."
									rows={3}
									value={field.state.value}
								/>
							</FormFieldBlock>
						)}
					</form.Field>

					<div className="flex items-center gap-3">
						<form.Field name="type">
							{(field) => (
								<FormFieldBlock label="类型">
									<Select
										onValueChange={(value) =>
											value && field.handleChange(value as MemoryType)
										}
										value={field.state.value}
									>
										<SelectTrigger className="w-32">
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
								</FormFieldBlock>
							)}
						</form.Field>

						<form.Field name="unresolved">
							{(field) => (
								<FormToggleField label="未解决">
									<Switch
										checked={field.state.value}
										onCheckedChange={field.handleChange}
									/>
								</FormToggleField>
							)}
						</form.Field>
					</div>

					<form.Field name="keywords">
						{(field) => (
							<FormFieldBlock
								error={
									field.state.meta.isTouched
										? readValidationMessage(field.state.meta.errors)
										: null
								}
								hint="最多 10 个。"
								label="关键词"
							>
								<div className="flex gap-2">
									<Input
										onChange={(event) => setKeywordInput(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												event.preventDefault();
												addKeyword();
											}
										}}
										placeholder="添加关键词..."
										value={keywordInput}
									/>
									<Button
										onClick={addKeyword}
										size="sm"
										type="button"
										variant="outline"
									>
										添加
									</Button>
								</div>

								{field.state.value.length > 0 ? (
									<div className="mt-2 flex flex-wrap gap-1.5">
										{field.state.value.map((keyword) => (
											<Badge
												className="gap-1 text-[10px]"
												key={keyword}
												variant="secondary"
											>
												{keyword}
												<button
													onClick={() =>
														field.handleChange(
															field.state.value.filter(
																(value) => value !== keyword
															)
														)
													}
													type="button"
												>
													<X size={10} />
												</button>
											</Badge>
										))}
									</div>
								) : null}
							</FormFieldBlock>
						)}
					</form.Field>

					<form.Field name="importance">
						{(field) => (
							<FormFieldBlock
								hint={`${(field.state.value * 100).toFixed(0)}%`}
								label="重要性"
							>
								<Slider
									max={1}
									min={0}
									onValueChange={(values) =>
										field.handleChange(getSliderValue(values, 0.5))
									}
									step={0.05}
									value={[field.state.value]}
								/>
							</FormFieldBlock>
						)}
					</form.Field>

					{submitError ? (
						<p className="text-destructive text-sm">{submitError}</p>
					) : null}

					<DialogFooter>
						<form.Subscribe
							selector={(state) => [state.canSubmit, state.isSubmitting]}
						>
							{([canSubmit, isSubmitting]) => (
								<Button disabled={!canSubmit} size="sm" type="submit">
									{isSubmitting ? "保存中…" : "保存"}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export type { MemoryData };
export { MemoryEditDialog };
