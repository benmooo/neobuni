import {
	type DiscordMessagingConfig,
	discordMessagingConfigInputSchema,
	discordMessagingConfigSchema,
	type MessagingConfigSource,
	type MessagingTargetType,
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
	createMessagingTargetDraft,
	getMessagingConfigSourceLabel,
	type MessagingTargetDraft,
	messagingTargetDraftSchema,
	removeItemAtIndex,
	stripMessagingTargetClientId,
	toMessagingTargetDrafts,
	updateItemAtIndex,
} from "./messaging-settings-model";
import {
	FieldHint,
	getMutationErrorMessage,
	Section,
	SummaryChip,
} from "./shared";

type DiscordFormValue = {
	enabled: boolean;
	botToken: string;
	appId: string;
	publicKey: string;
	webhookSecret: string;
	metadata: Record<string, unknown>;
	targets: MessagingTargetDraft[];
};

type MessagingTargetTypeOption = {
	value: MessagingTargetType;
	label: string;
	hint: string;
};

const DISCORD_TARGET_TYPE_OPTIONS: MessagingTargetTypeOption[] = [
	{
		value: "channel",
		label: "Channel",
		hint: "普通频道、私信频道或 thread 都可以直接使用 channel id。",
	},
	{
		value: "topic",
		label: "Thread / Topic",
		hint: "Discord thread / forum post 本质上也是 channel id。",
	},
	{
		value: "group",
		label: "Group",
		hint: "保留给跨平台 alias 语义；Discord Phase 1 里通常直接用 channel 即可。",
	},
	{
		value: "supergroup",
		label: "Supergroup",
		hint: "保留给跨平台 alias 语义；Discord 一般不需要单独区分。",
	},
];
const DISCORD_SECTION_DESCRIPTION = getMessagingPlatformDescription("discord");

const discordFormSchema = z
	.object({
		enabled: z.boolean(),
		botToken: z.string().trim().max(400),
		appId: z.string().trim().max(200),
		publicKey: z.string().trim().max(300),
		webhookSecret: z.string().trim().max(300),
		metadata: z.record(z.string(), z.unknown()),
		targets: z.array(messagingTargetDraftSchema).max(100),
	})
	.superRefine((value, ctx) => {
		const result = discordMessagingConfigInputSchema.safeParse({
			enabled: value.enabled,
			botToken: value.botToken,
			appId: value.appId,
			publicKey: value.publicKey,
			webhookSecret: value.webhookSecret,
			metadata: value.metadata,
			targets: value.targets.map(stripMessagingTargetClientId),
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

const fetchDiscordConfig = async () =>
	discordMessagingConfigSchema.parse(await api.config.messaging.discord.get());

function DiscordSection() {
	const queryClient = useQueryClient();
	const { data: config, isLoading } = useQuery({
		queryKey: ["config", "messaging", "discord"],
		queryFn: fetchDiscordConfig,
	});

	if (isLoading || !config) {
		return (
			<Section description={DISCORD_SECTION_DESCRIPTION} title="Discord 集成">
				<Card size="sm">
					<CardContent className="text-muted-foreground text-sm">
						加载中…
					</CardContent>
				</Card>
			</Section>
		);
	}

	return (
		<DiscordConfigForm
			initialValue={toDiscordFormValue(config)}
			key={config.id}
			onSaved={() => {
				queryClient.invalidateQueries({
					queryKey: ["config", "messaging", "discord"],
				});
			}}
			source={config.source}
		/>
	);
}

const toDiscordFormValue = (
	config: DiscordMessagingConfig
): DiscordFormValue => ({
	enabled: config.enabled,
	botToken: config.botToken,
	appId: config.appId,
	publicKey: config.publicKey,
	webhookSecret: config.webhookSecret,
	metadata: {
		...config.metadata,
	},
	targets: toMessagingTargetDrafts(config.targets),
});

function DiscordConfigForm({
	source,
	initialValue,
	onSaved,
}: {
	source: MessagingConfigSource;
	initialValue: DiscordFormValue;
	onSaved: () => void;
}) {
	const [submitError, setSubmitError] = useState<string | null>(null);
	const save = useMutation({
		mutationFn: async (value: DiscordFormValue) => {
			await api.config.messaging.discord.put({
				enabled: value.enabled,
				botToken: value.botToken,
				appId: value.appId,
				publicKey: value.publicKey,
				webhookSecret: value.webhookSecret,
				metadata: value.metadata,
				targets: value.targets.map(stripMessagingTargetClientId),
			});
		},
		onSuccess: onSaved,
	});

	const form = useForm({
		defaultValues: initialValue,
		validators: {
			onBlur: discordFormSchema,
			onSubmit: discordFormSchema,
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
		<Section description={DISCORD_SECTION_DESCRIPTION} title="Discord 集成">
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
				Discord Phase 1 支持群里 `@buni`、回复 bot 消息、`/buni` slash
				command，以及主动发消息到已配置 target。
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
								placeholder="填写 Discord bot token"
								type="password"
								value={field.state.value}
							/>
						</FormFieldBlock>
					)}
				</form.Field>

				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
									placeholder="Discord application id"
									value={field.state.value}
								/>
							</FormFieldBlock>
						)}
					</form.Field>

					<form.Field name="publicKey">
						{(field) => (
							<FormFieldBlock
								error={
									field.state.meta.isTouched
										? readValidationMessage(field.state.meta.errors)
										: null
								}
								label="Public Key"
							>
								<Input
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									placeholder="用于验证 Discord interaction"
									value={field.state.value}
								/>
							</FormFieldBlock>
						)}
					</form.Field>
				</div>

				<form.Field name="webhookSecret">
					{(field) => (
						<FormFieldBlock
							error={
								field.state.meta.isTouched
									? readValidationMessage(field.state.meta.errors)
									: null
							}
							hint="用于额外保护你的 `/v1/integrations/discord/events` 入口。"
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

				<form.Field name="enabled">
					{(field) => (
						<FormToggleField label="启用 Discord">
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
										{getMessagingTargetUsageHint("discord")}
									</div>
								</div>
								<Button
									onClick={() =>
										field.handleChange([
											...field.state.value,
											createMessagingTargetDraft(),
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
										{getMessagingTargetEmptyState("Discord 频道别名")}
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
													placeholder="friends_server"
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
													placeholder="朋友群"
													value={target.label}
												/>
											</FormFieldBlock>

											<FormFieldBlock
												hint={
													DISCORD_TARGET_TYPE_OPTIONS.find(
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
														{DISCORD_TARGET_TYPE_OPTIONS.map((option) => (
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
																	targetId: event.target.value,
																})
															)
														)
													}
													placeholder="Discord channel / thread id"
													value={target.targetId}
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

export { DiscordSection };
