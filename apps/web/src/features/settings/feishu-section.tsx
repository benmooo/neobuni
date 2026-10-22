import {
	type FeishuConfigSource,
	type FeishuReceiveIdType,
	type FeishuTargetConfigInput,
	feishuConfigInputSchema,
	feishuConfigSchema,
} from "@neobuni/contracts";
import { Button } from "@neobuni/ui/components/button";
import { Card, CardContent } from "@neobuni/ui/components/card";
import { Input } from "@neobuni/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@neobuni/ui/components/select";
import { Switch } from "@neobuni/ui/components/switch";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

import {
	FormFieldBlock,
	FormToggleField,
} from "@/components/form/FormFieldBlock";
import { api } from "@/lib/api";
import { readValidationMessage } from "@/lib/form-errors";

import {
	getMessagingPlatformDescription,
	getMessagingTargetEmptyState,
	getMessagingTargetUsageHint,
	messagingSettingsCopy,
} from "./messaging-settings-copy";
import {
	FieldHint,
	getMutationErrorMessage,
	Section,
	SummaryChip,
} from "./shared";

const feishuTargetFormSchema = z.object({
	alias: z
		.string()
		.trim()
		.min(1)
		.max(80)
		.regex(
			/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
			"Alias must start with a letter or number and only contain letters, numbers, underscores, or hyphens."
		),
	label: z.string().trim().max(120),
	receiveIdType: z.enum(["chat_id", "open_id", "user_id", "union_id", "email"]),
	receiveId: z.string().trim().min(1).max(200),
	enabled: z.boolean(),
});

type FeishuTargetFormValue = FeishuTargetConfigInput;
type FeishuTargetDraft = FeishuTargetFormValue & {
	clientId: string;
};

type FeishuFormValue = {
	enabled: boolean;
	appId: string;
	appSecret: string;
	baseUrl: string;
	targets: FeishuTargetDraft[];
};

type FeishuReceiveIdTypeOption = {
	value: FeishuReceiveIdType;
	label: string;
	hint: string;
};

const FEISHU_BASE_URL_PLACEHOLDER = "https://open.feishu.cn/open-apis";

const FEISHU_RECEIVE_ID_TYPE_OPTIONS: FeishuReceiveIdTypeOption[] = [
	{ value: "chat_id", label: "Chat ID", hint: "群聊或会话发送，最常用。" },
	{ value: "open_id", label: "Open ID", hint: "按用户 open_id 定向发送。" },
	{ value: "user_id", label: "User ID", hint: "按用户 user_id 定向发送。" },
	{ value: "union_id", label: "Union ID", hint: "按 union_id 定向发送。" },
	{ value: "email", label: "Email", hint: "按邮箱地址定向发送。" },
];
const FEISHU_SECTION_DESCRIPTION = getMessagingPlatformDescription("feishu");

const feishuTargetDraftSchema = feishuTargetFormSchema.extend({
	clientId: z.string().min(1),
});

const stripClientId = ({
	clientId: _clientId,
	...target
}: FeishuTargetDraft): FeishuTargetFormValue => target;

const feishuFormSchema = z
	.object({
		enabled: z.boolean(),
		appId: z.string().trim().max(200),
		appSecret: z.string().trim().max(400),
		baseUrl: z.string().trim().max(500),
		targets: z.array(feishuTargetDraftSchema).max(100),
	})
	.superRefine((value, ctx) => {
		const result = feishuConfigInputSchema.safeParse({
			enabled: value.enabled,
			appId: value.appId,
			appSecret: value.appSecret,
			baseUrl: value.baseUrl,
			targets: value.targets.map(stripClientId),
		});

		if (!result.success) {
			result.error.issues.forEach((issue) => {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: issue.path,
					message: issue.message,
				});
			});
		}
	});

const createDraftTarget = (
	input?: Partial<FeishuTargetFormValue>
): FeishuTargetDraft => ({
	clientId: crypto.randomUUID(),
	alias: input?.alias ?? "",
	label: input?.label ?? "",
	receiveIdType: input?.receiveIdType ?? "chat_id",
	receiveId: input?.receiveId ?? "",
	enabled: input?.enabled ?? true,
});

const toDraftTargets = (targets: FeishuTargetFormValue[]) =>
	targets.map((target) => createDraftTarget(target));

const updateItemAtIndex = <T,>(
	items: T[],
	index: number,
	updater: (item: T) => T
) =>
	items.map((item, currentIndex) =>
		currentIndex === index ? updater(item) : item
	);

const removeItemAtIndex = <T,>(items: T[], index: number) =>
	items.filter((_, currentIndex) => currentIndex !== index);

const fetchFeishuConfig = async () =>
	feishuConfigSchema.parse(await api.config.messaging.feishu.get());

const getFeishuSourceLabel = (source: FeishuConfigSource) => {
	if (source === "database") {
		return "数据库";
	}
	if (source === "env") {
		return "环境变量回退";
	}
	return "未配置";
};

function FeishuSection() {
	const queryClient = useQueryClient();
	const { data: config, isLoading } = useQuery({
		queryKey: ["config", "feishu"],
		queryFn: fetchFeishuConfig,
	});

	if (isLoading || !config) {
		return (
			<Section description={FEISHU_SECTION_DESCRIPTION} title="Feishu 集成">
				<Card size="sm">
					<CardContent className="text-muted-foreground text-sm">
						加载中…
					</CardContent>
				</Card>
			</Section>
		);
	}

	return (
		<FeishuConfigForm
			initialValue={{
				enabled: config.enabled,
				appId: config.appId,
				appSecret: config.appSecret,
				baseUrl: config.baseUrl,
				targets: toDraftTargets(config.targets),
			}}
			key={config.id}
			onSaved={() => {
				queryClient.invalidateQueries({ queryKey: ["config", "feishu"] });
			}}
			source={config.source}
		/>
	);
}

function FeishuConfigForm({
	source,
	initialValue,
	onSaved,
}: {
	source: FeishuConfigSource;
	initialValue: FeishuFormValue;
	onSaved: () => void;
}) {
	const [submitError, setSubmitError] = useState<string | null>(null);
	const save = useMutation({
		mutationFn: async (value: FeishuFormValue) => {
			await api.config.messaging.feishu.put({
				enabled: value.enabled,
				appId: value.appId,
				appSecret: value.appSecret,
				baseUrl: value.baseUrl,
				targets: value.targets.map(stripClientId),
			});
		},
		onSuccess: onSaved,
	});

	const form = useForm({
		defaultValues: initialValue,
		validators: {
			onBlur: feishuFormSchema,
			onSubmit: feishuFormSchema,
		},
		onSubmit: async ({ value }) => {
			setSubmitError(null);

			try {
				await save.mutateAsync(value);
			} catch (error) {
				setSubmitError(getMutationErrorMessage(error));
			}
		},
	});

	return (
		<Section description={FEISHU_SECTION_DESCRIPTION} title="Feishu 集成">
			<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
				<SummaryChip label="来源" value={getFeishuSourceLabel(source)} />
				<SummaryChip
					label="发送状态"
					value={form.state.values.enabled ? "已启用" : "未启用"}
				/>
				<SummaryChip
					label={messagingSettingsCopy.targetCountLabel}
					value={`${form.state.values.targets.length}`}
				/>
			</div>

			{source === "env" ? (
				<FieldHint>
					当前显示的是环境变量回退配置。保存后会切换为当前 Profile
					的数据库配置，不再依赖全局 env。
				</FieldHint>
			) : null}

			<form
				className="flex flex-col gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<form.Field name="appId">
					{(field) => (
						<FormFieldBlock
							error={
								field.state.meta.isTouched
									? readValidationMessage(field.state.meta.errors)
									: null
							}
							label="App ID"
						>
							<Input
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder="cli_xxx"
								value={field.state.value}
							/>
						</FormFieldBlock>
					)}
				</form.Field>

				<form.Field name="appSecret">
					{(field) => (
						<FormFieldBlock
							error={
								field.state.meta.isTouched
									? readValidationMessage(field.state.meta.errors)
									: null
							}
							label="App Secret"
						>
							<Input
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder="填写飞书应用密钥"
								type="password"
								value={field.state.value}
							/>
						</FormFieldBlock>
					)}
				</form.Field>

				<form.Field name="baseUrl">
					{(field) => (
						<FormFieldBlock
							error={
								field.state.meta.isTouched
									? readValidationMessage(field.state.meta.errors)
									: null
							}
							label="Base URL（可选）"
						>
							<Input
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder={FEISHU_BASE_URL_PLACEHOLDER}
								value={field.state.value}
							/>
						</FormFieldBlock>
					)}
				</form.Field>

				<form.Field name="enabled">
					{(field) => (
						<FormToggleField label="启用 Feishu 发送">
							<Switch
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</FormToggleField>
					)}
				</form.Field>

				<form.Field name="targets">
					{(field) => (
						<div className="flex flex-col gap-3">
							<div className="flex items-center justify-between">
								<div>
									<div className="font-medium text-foreground text-sm">
										{messagingSettingsCopy.targetsSectionTitle}
									</div>
									<div className="mt-1 text-muted-foreground text-xs">
										{getMessagingTargetUsageHint("feishu")}
									</div>
								</div>
								<Button
									onClick={() =>
										field.handleChange([
											...field.state.value,
											createDraftTarget(),
										])
									}
									type="button"
									variant="outline"
								>
									{messagingSettingsCopy.addTargetLabel}
								</Button>
							</div>

							{field.state.value.length === 0 ? (
								<Card size="sm">
									<CardContent className="text-muted-foreground text-xs">
										{getMessagingTargetEmptyState("群聊或会话别名")}
									</CardContent>
								</Card>
							) : null}

							{field.state.value.map((target, index) => (
								<Card key={target.clientId} size="sm">
									<CardContent className="space-y-3">
										<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
											<FormFieldBlock
												label={messagingSettingsCopy.targetAliasLabel}
											>
												<Input
													onChange={(event) =>
														field.handleChange(
															updateItemAtIndex(
																field.state.value,
																index,
																(item) => ({
																	...item,
																	alias: event.target.value,
																})
															)
														)
													}
													placeholder="daily_sync"
													value={target.alias}
												/>
											</FormFieldBlock>

											<FormFieldBlock label="Label">
												<Input
													onChange={(event) =>
														field.handleChange(
															updateItemAtIndex(
																field.state.value,
																index,
																(item) => ({
																	...item,
																	label: event.target.value,
																})
															)
														)
													}
													placeholder="Daily Sync Group"
													value={target.label}
												/>
											</FormFieldBlock>

											<FormFieldBlock
												hint={
													FEISHU_RECEIVE_ID_TYPE_OPTIONS.find(
														(option) => option.value === target.receiveIdType
													)?.hint
												}
												label={messagingSettingsCopy.targetTypeLabel}
											>
												<Select
													onValueChange={(value) => {
														if (!value) {
															return;
														}

														field.handleChange(
															updateItemAtIndex(
																field.state.value,
																index,
																(item) => ({
																	...item,
																	receiveIdType: value as FeishuReceiveIdType,
																})
															)
														);
													}}
													value={target.receiveIdType}
												>
													<SelectTrigger className="w-full">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{FEISHU_RECEIVE_ID_TYPE_OPTIONS.map((option) => (
															<SelectItem
																key={option.value}
																value={option.value}
															>
																{option.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</FormFieldBlock>

											<FormFieldBlock
												label={messagingSettingsCopy.targetIdLabel}
											>
												<Input
													onChange={(event) =>
														field.handleChange(
															updateItemAtIndex(
																field.state.value,
																index,
																(item) => ({
																	...item,
																	receiveId: event.target.value,
																})
															)
														)
													}
													placeholder="oc_xxx / ou_xxx / 邮箱"
													value={target.receiveId}
												/>
											</FormFieldBlock>
										</div>

										<div className="flex items-center justify-between">
											<FormToggleField label="启用此 Target">
												<Switch
													checked={target.enabled}
													onCheckedChange={(checked) =>
														field.handleChange(
															updateItemAtIndex(
																field.state.value,
																index,
																(item) => ({
																	...item,
																	enabled: checked,
																})
															)
														)
													}
												/>
											</FormToggleField>

											<Button
												onClick={() =>
													field.handleChange(
														removeItemAtIndex(field.state.value, index)
													)
												}
												type="button"
												variant="outline"
											>
												删除
											</Button>
										</div>
									</CardContent>
								</Card>
							))}

							{field.state.meta.isTouched ? (
								<FieldHint tone="destructive">
									{readValidationMessage(field.state.meta.errors)}
								</FieldHint>
							) : null}
						</div>
					)}
				</form.Field>

				{submitError ? (
					<FieldHint tone="destructive">{submitError}</FieldHint>
				) : null}

				<form.Subscribe
					selector={(state) => [state.canSubmit, state.isSubmitting]}
				>
					{([canSubmit, isSubmitting]) => (
						<Button
							className="self-end"
							disabled={!canSubmit}
							size="sm"
							type="submit"
						>
							{isSubmitting ? "保存中…" : "保存"}
						</Button>
					)}
				</form.Subscribe>
			</form>
		</Section>
	);
}

export { FeishuSection };
