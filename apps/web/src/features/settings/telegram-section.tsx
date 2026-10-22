import {
	type MessagingConfigSource,
	type MessagingTargetType,
	type TelegramMessagingConfig,
	telegramMessagingConfigInputSchema,
	telegramMessagingConfigSchema,
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
import {
	readValidationMessage,
	validateCompositeForm,
} from "@/lib/form-errors";
import {
	getMessagingPlatformDescription,
	getMessagingTargetEmptyState,
	getMessagingTargetUsageHint,
	messagingSettingsCopy,
} from "./messaging-settings-copy";
import {
	createMessagingTargetDraft,
	getMessagingConfigSourceLabel,
	type MessagingTargetFormValue,
	messagingTargetFormSchema,
	readMessageThreadIdInput,
	removeItemAtIndex,
	stripMessagingTargetClientId,
	updateItemAtIndex,
	writeMessageThreadIdMetadata,
} from "./messaging-settings-model";
import {
	FieldHint,
	getMutationErrorMessage,
	Section,
	SummaryChip,
} from "./shared";

type TelegramTargetDraft = MessagingTargetFormValue & {
	clientId: string;
	messageThreadIdInput: string;
};

type TelegramFormValue = {
	enabled: boolean;
	botToken: string;
	appId: string;
	publicKey: string;
	webhookSecret: string;
	metadata: Record<string, unknown>;
	botUsername: string;
	targets: TelegramTargetDraft[];
};

type MessagingTargetTypeOption = {
	value: MessagingTargetType;
	label: string;
	hint: string;
};

const TELEGRAM_TARGET_TYPE_OPTIONS: MessagingTargetTypeOption[] = [
	{ value: "group", label: "Group", hint: "普通群聊 chat id。" },
	{
		value: "supergroup",
		label: "Supergroup",
		hint: "超级群 / migrated group 的 chat id。",
	},
	{
		value: "topic",
		label: "Topic",
		hint: "同一个 supergroup 的话题；需要同时填写 chat id 和 topic thread id。",
	},
	{ value: "channel", label: "Channel", hint: "Telegram channel chat id。" },
];
const TELEGRAM_SECTION_DESCRIPTION =
	getMessagingPlatformDescription("telegram");

const telegramTargetDraftSchema = messagingTargetFormSchema.extend({
	clientId: z.string().min(1),
	messageThreadIdInput: z.string().trim().max(30),
});

const readBotUsernameInput = (metadata: Record<string, unknown>) =>
	typeof metadata.botUsername === "string" ? metadata.botUsername : "";

const writeBotUsernameMetadata = (
	metadata: Record<string, unknown>,
	botUsername: string
) => {
	const trimmed = botUsername.trim();
	const rest = { ...metadata };
	delete rest.botUsername;

	return trimmed.length > 0
		? {
				...rest,
				botUsername: trimmed,
			}
		: rest;
};

const createTelegramTargetDraft = (
	input?: Partial<MessagingTargetFormValue>
): TelegramTargetDraft => ({
	...createMessagingTargetDraft(input),
	messageThreadIdInput: readMessageThreadIdInput(input?.metadata ?? {}),
});

const toTelegramTargetDrafts = (targets: TelegramMessagingConfig["targets"]) =>
	targets.map((target) => createTelegramTargetDraft(target));

const stripTelegramTargetDraft = ({
	messageThreadIdInput,
	...target
}: TelegramTargetDraft) => {
	const { clientId, ...targetWithoutClientId } = target;
	void clientId;
	return {
		...stripMessagingTargetClientId({
			...targetWithoutClientId,
			clientId: "ignored",
		}),
		metadata: writeMessageThreadIdMetadata(
			target.metadata,
			messageThreadIdInput
		),
	};
};

const telegramFormSchema = z
	.object({
		enabled: z.boolean(),
		botToken: z.string().trim().max(400),
		appId: z.string().trim().max(200),
		publicKey: z.string().trim().max(300),
		webhookSecret: z.string().trim().max(300),
		metadata: z.record(z.string(), z.unknown()),
		botUsername: z.string().trim().max(200),
		targets: z.array(telegramTargetDraftSchema).max(100),
	})
	.superRefine((value, ctx) => {
		value.targets.forEach((target, index) => {
			if (target.targetType !== "topic") {
				return;
			}

			const threadId = target.messageThreadIdInput.trim();
			if (threadId.length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["targets", index, "messageThreadIdInput"],
					message: "Telegram topic target 需要填写 topic thread id。",
				});
				return;
			}

			if (!/^\d+$/.test(threadId)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["targets", index, "messageThreadIdInput"],
					message: "Topic thread id 必须是整数。",
				});
			}
		});

		const result = telegramMessagingConfigInputSchema.safeParse({
			enabled: value.enabled,
			botToken: value.botToken,
			appId: value.appId,
			publicKey: value.publicKey,
			webhookSecret: value.webhookSecret,
			metadata: writeBotUsernameMetadata(value.metadata, value.botUsername),
			targets: value.targets.map(stripTelegramTargetDraft),
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

const fetchTelegramConfig = async () =>
	telegramMessagingConfigSchema.parse(
		await api.config.messaging.telegram.get()
	);

const toTelegramFormValue = (
	config: TelegramMessagingConfig
): TelegramFormValue => ({
	enabled: config.enabled,
	botToken: config.botToken,
	appId: config.appId,
	publicKey: config.publicKey,
	webhookSecret: config.webhookSecret,
	metadata: {
		...config.metadata,
	},
	botUsername: readBotUsernameInput(config.metadata),
	targets: toTelegramTargetDrafts(config.targets),
});

function TelegramSection() {
	const queryClient = useQueryClient();
	const { data: config, isLoading } = useQuery({
		queryKey: ["config", "messaging", "telegram"],
		queryFn: fetchTelegramConfig,
	});

	if (isLoading || !config) {
		return (
			<Section description={TELEGRAM_SECTION_DESCRIPTION} title="Telegram 集成">
				<Card size="sm">
					<CardContent className="text-muted-foreground text-sm">
						加载中…
					</CardContent>
				</Card>
			</Section>
		);
	}

	return (
		<TelegramConfigForm
			initialValue={toTelegramFormValue(config)}
			key={config.id}
			onSaved={() => {
				queryClient.invalidateQueries({
					queryKey: ["config", "messaging", "telegram"],
				});
			}}
			source={config.source}
		/>
	);
}

function TelegramConfigForm({
	source,
	initialValue,
	onSaved,
}: {
	source: MessagingConfigSource;
	initialValue: TelegramFormValue;
	onSaved: () => void;
}) {
	const [submitError, setSubmitError] = useState<string | null>(null);
	const save = useMutation({
		mutationFn: async (value: TelegramFormValue) => {
			await api.config.messaging.telegram.put({
				enabled: value.enabled,
				botToken: value.botToken,
				appId: value.appId,
				publicKey: value.publicKey,
				webhookSecret: value.webhookSecret,
				metadata: writeBotUsernameMetadata(value.metadata, value.botUsername),
				targets: value.targets.map(stripTelegramTargetDraft),
			});
		},
		onSuccess: onSaved,
	});

	const form = useForm({
		defaultValues: initialValue,
		validators: {
			onChange: ({ value }) => validateCompositeForm(telegramFormSchema, value),
			onBlur: ({ value }) => validateCompositeForm(telegramFormSchema, value),
			onSubmit: ({ value }) => validateCompositeForm(telegramFormSchema, value),
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
		<Section description={TELEGRAM_SECTION_DESCRIPTION} title="Telegram 集成">
			<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
				<SummaryChip
					label="来源"
					value={getMessagingConfigSourceLabel(source)}
				/>
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

			<FieldHint>
				Telegram Phase 1 接受 `/buni` 和 reply-to-bot 触发，兼容 privacy
				mode；主动发送支持群聊、频道和 topic。
			</FieldHint>

			<form
				className="flex flex-col gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<form.Field name="botToken">
					{(field) => (
						<FormFieldBlock
							error={
								field.state.meta.isTouched
									? readValidationMessage(field.state.meta.errors)
									: null
							}
							label="Bot Token"
						>
							<Input
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder="填写 Telegram bot token"
								type="password"
								value={field.state.value}
							/>
						</FormFieldBlock>
					)}
				</form.Field>

				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<form.Field name="webhookSecret">
						{(field) => (
							<FormFieldBlock
								error={
									field.state.meta.isTouched
										? readValidationMessage(field.state.meta.errors)
										: null
								}
								hint="写到 Telegram webhook header 校验上，用来保护入站事件。"
								label="Webhook Secret（可选）"
							>
								<Input
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									placeholder="可选，建议填写一段随机 secret"
									type="password"
									value={field.state.value}
								/>
							</FormFieldBlock>
						)}
					</form.Field>

					<form.Field name="botUsername">
						{(field) => (
							<FormFieldBlock
								error={
									field.state.meta.isTouched
										? readValidationMessage(field.state.meta.errors)
										: null
								}
								hint="仅用于配置说明和后续引导，不影响发送。"
								label="Bot Username（可选）"
							>
								<Input
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									placeholder="@buni_bot"
									value={field.state.value}
								/>
							</FormFieldBlock>
						)}
					</form.Field>
				</div>

				<form.Field name="enabled">
					{(field) => (
						<FormToggleField label="启用 Telegram">
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
										{getMessagingTargetUsageHint("telegram")}
									</div>
								</div>
								<Button
									onClick={() =>
										field.handleChange([
											...field.state.value,
											createTelegramTargetDraft(),
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
										{getMessagingTargetEmptyState("群聊或话题别名")}
									</CardContent>
								</Card>
							) : null}

							{field.state.value.map((target, index) => (
								<Card key={target.clientId} size="sm">
									<CardContent className="space-y-3">
										<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
											<FormFieldBlock
												hint="以字母或数字开头，仅支持字母、数字、下划线和连字符，例如 matt_xx。显示名称请填写在 Label。"
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
													placeholder="family_group"
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
													placeholder="家庭群"
													value={target.label}
												/>
											</FormFieldBlock>

											<FormFieldBlock
												hint={
													TELEGRAM_TARGET_TYPE_OPTIONS.find(
														(option) => option.value === target.targetType
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
																	targetType: value as MessagingTargetType,
																})
															)
														);
													}}
													value={target.targetType}
												>
													<SelectTrigger className="w-full">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{TELEGRAM_TARGET_TYPE_OPTIONS.map((option) => (
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

											<FormFieldBlock label="Chat ID">
												<Input
													onChange={(event) =>
														field.handleChange(
															updateItemAtIndex(
																field.state.value,
																index,
																(item) => ({
																	...item,
																	targetId: event.target.value,
																})
															)
														)
													}
													placeholder="-1001234567890"
													value={target.targetId}
												/>
											</FormFieldBlock>

											<FormFieldBlock
												hint="如果 target type 选的是 topic，这里填写 Telegram message_thread_id。"
												label="Topic Thread ID（仅 topic）"
											>
												<Input
													onChange={(event) =>
														field.handleChange(
															updateItemAtIndex(
																field.state.value,
																index,
																(item) => ({
																	...item,
																	messageThreadIdInput: event.target.value,
																})
															)
														)
													}
													placeholder="42"
													value={target.messageThreadIdInput}
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

				<form.Subscribe selector={(state) => state.errors}>
					{(errors) => {
						const message = readValidationMessage(errors);
						return message ? (
							<FieldHint tone="destructive">{message}</FieldHint>
						) : null;
					}}
				</form.Subscribe>

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

export { TelegramSection };
