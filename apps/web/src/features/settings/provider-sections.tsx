import {
	type ProviderConfig,
	providerConfigInputSchema,
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
import { Slider } from "@neobuni/ui/components/slider";
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

import { FieldHint, getMutationErrorMessage, Section } from "./shared";

type ProviderProtocolValue = "mock" | "openai" | "anthropic";
type ProviderValue =
	| "mock"
	| "openai"
	| "openrouter"
	| "anthropic"
	| "deepseek"
	| "qwen";
type EmbeddingProviderValue = "openai" | "openrouter" | "qwen";
type ReasoningProviderValue = "openai" | "openrouter" | "deepseek" | "qwen";

type ProviderPreset = {
	protocol: ProviderProtocolValue;
	model: string;
	baseUrl: string;
	baseUrlPlaceholder: string;
	note: string;
	apiKeyPlaceholder: string;
};

type ProviderFormValue<TProvider extends string> = {
	provider: TProvider;
	protocol: ProviderProtocolValue;
	model: string;
	apiKey: string;
	baseUrl: string;
	enabled: boolean;
};

type ReasoningProviderFormValue = ProviderFormValue<ReasoningProviderValue> & {
	digestThreshold: number;
};

const chatProviderPresets: Record<ProviderValue, ProviderPreset> = {
	mock: {
		protocol: "mock",
		model: "buni-mock",
		baseUrl: "",
		baseUrlPlaceholder: "",
		note: "Mock 模式不需要 API Key，适合本地 UI 联调。",
		apiKeyPlaceholder: "",
	},
	openai: {
		protocol: "openai",
		model: "gpt-5.4-mini",
		baseUrl: "",
		baseUrlPlaceholder: "https://api.openai.com/v1",
		note: "OpenAI 可直接留空 Base URL，默认走官方地址。",
		apiKeyPlaceholder: "sk-...",
	},
	openrouter: {
		protocol: "openai",
		model: "openai/gpt-5",
		baseUrl: "https://openrouter.ai/api/v1",
		baseUrlPlaceholder: "https://openrouter.ai/api/v1",
		note: "OpenRouter 聊天模型通常使用 provider/model 格式；默认走官方 API 地址。",
		apiKeyPlaceholder: "sk-or-v1-...",
	},
	anthropic: {
		protocol: "anthropic",
		model: "claude-sonnet-4-20250514",
		baseUrl: "",
		baseUrlPlaceholder: "https://api.anthropic.com",
		note: "Anthropic 可直接留空 Base URL，默认走官方地址。",
		apiKeyPlaceholder: "sk-ant-...",
	},
	deepseek: {
		protocol: "anthropic",
		model: "deepseek-v4-flash",
		baseUrl: "https://api.deepseek.com/anthropic",
		baseUrlPlaceholder: "https://api.deepseek.com/anthropic",
		note: "聊天链路默认使用 DeepSeek 官方 Anthropic-compatible 地址。",
		apiKeyPlaceholder: "sk-...",
	},
	qwen: {
		protocol: "openai",
		model: "qwen-plus",
		baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		baseUrlPlaceholder: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		note: "默认使用 DashScope 国际站；北京地域可改为 https://dashscope.aliyuncs.com/compatible-mode/v1。",
		apiKeyPlaceholder: "sk-...",
	},
};

const memoryEmbeddingPresets: Record<EmbeddingProviderValue, ProviderPreset> = {
	openai: {
		protocol: "openai",
		model: "text-embedding-3-small",
		baseUrl: "",
		baseUrlPlaceholder: "https://api.openai.com/v1",
		note: "OpenAI 可直接留空 Base URL，默认走官方地址。",
		apiKeyPlaceholder: "sk-...",
	},
	openrouter: {
		protocol: "openai",
		model: "openai/text-embedding-3-small",
		baseUrl: "https://openrouter.ai/api/v1",
		baseUrlPlaceholder: "https://openrouter.ai/api/v1",
		note: "OpenRouter embedding 默认仍走 OpenAI-compatible 接口；当前向量库存储固定使用 1024 维。",
		apiKeyPlaceholder: "sk-or-v1-...",
	},
	qwen: {
		protocol: "openai",
		model: "text-embedding-v4",
		baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		baseUrlPlaceholder: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		note: "默认使用 北京地域；国际站可改为 https://dashscope-intl.aliyuncs.com/compatible-mode/v1。",
		apiKeyPlaceholder: "sk-...",
	},
};

const memoryReasoningPresets: Record<ReasoningProviderValue, ProviderPreset> = {
	openai: {
		protocol: "openai",
		model: "gpt-5.4-mini",
		baseUrl: "",
		baseUrlPlaceholder: "https://api.openai.com/v1",
		note: "OpenAI 可直接留空 Base URL，默认走官方地址。",
		apiKeyPlaceholder: "sk-...",
	},
	openrouter: {
		protocol: "openai",
		model: "openai/gpt-5",
		baseUrl: "https://openrouter.ai/api/v1",
		baseUrlPlaceholder: "https://openrouter.ai/api/v1",
		note: "OpenRouter reasoning 默认也走 OpenAI-compatible chat completions；模型名通常为 provider/model。",
		apiKeyPlaceholder: "sk-or-v1-...",
	},
	deepseek: {
		protocol: "openai",
		model: "deepseek-v4-flash",
		baseUrl: "https://api.deepseek.com",
		baseUrlPlaceholder: "https://api.deepseek.com",
		note: "默认使用 DeepSeek 官方 OpenAI-compatible 地址。",
		apiKeyPlaceholder: "sk-...",
	},
	qwen: {
		protocol: "openai",
		model: "qwen-plus",
		baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		baseUrlPlaceholder: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		note: "如果你想用 Qwen 做 reasoning，默认使用 DashScope 北京地域。",
		apiKeyPlaceholder: "sk-...",
	},
};

const chatProviderFormSchema = z
	.object({
		provider: z.enum([
			"mock",
			"openai",
			"openrouter",
			"anthropic",
			"deepseek",
			"qwen",
		]),
		protocol: z.enum(["mock", "openai", "anthropic"]),
		model: z.string().trim().min(1).max(120),
		apiKey: z.string().trim().max(400),
		baseUrl: z.string().trim().max(500),
		enabled: z.boolean(),
	})
	.superRefine((value, ctx) => {
		const result = providerConfigInputSchema.safeParse({
			...value,
			metadata: {},
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

const embeddingProviderFormSchema = z
	.object({
		provider: z.enum(["openai", "openrouter", "qwen"]),
		protocol: z.enum(["openai"]),
		model: z.string().trim().min(1).max(120),
		apiKey: z.string().trim().max(400),
		baseUrl: z.string().trim().max(500),
		enabled: z.boolean(),
	})
	.superRefine((value, ctx) => {
		const result = providerConfigInputSchema.safeParse({
			...value,
			metadata: { dimension: 1024 },
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

const reasoningProviderFormSchema = z
	.object({
		provider: z.enum(["openai", "openrouter", "deepseek", "qwen"]),
		protocol: z.enum(["openai"]),
		model: z.string().trim().min(1).max(120),
		apiKey: z.string().trim().max(400),
		baseUrl: z.string().trim().max(500),
		enabled: z.boolean(),
		digestThreshold: z.number().int().min(10).max(100),
	})
	.superRefine((value, ctx) => {
		const result = providerConfigInputSchema.safeParse({
			provider: value.provider,
			protocol: value.protocol,
			model: value.model,
			apiKey: value.apiKey,
			baseUrl: value.baseUrl,
			enabled: value.enabled,
			metadata: { digestThreshold: value.digestThreshold },
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

const shouldReplacePresetValue = (value: string, previousDefault: string) =>
	value.trim().length === 0 || value === previousDefault;

const getBaseUrlLabel = (provider: string) =>
	provider === "openai" || provider === "openrouter" || provider === "anthropic"
		? "Base URL（可选）"
		: "Base URL";

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

const buildChatProviderInitialValue = (
	config: ProviderConfig | null | undefined
): ProviderFormValue<ProviderValue> => {
	const provider = (config?.provider ?? "mock") as ProviderValue;
	const preset = chatProviderPresets[provider];

	return {
		provider,
		protocol: config?.protocol ?? preset.protocol,
		model: config?.model || preset.model,
		apiKey: config?.apiKey ?? "",
		baseUrl: config?.baseUrl || preset.baseUrl,
		enabled: config?.enabled ?? true,
	};
};

const buildMemoryEmbeddingInitialValue = (
	config: ProviderConfig | null | undefined
): ProviderFormValue<EmbeddingProviderValue> => {
	const provider = (config?.provider ?? "qwen") as EmbeddingProviderValue;
	const preset = memoryEmbeddingPresets[provider];

	return {
		provider,
		protocol: config?.protocol ?? preset.protocol,
		model: config?.model || preset.model,
		apiKey: config?.apiKey ?? "",
		baseUrl: config?.baseUrl || preset.baseUrl,
		enabled: config?.enabled ?? true,
	};
};

const buildMemoryReasoningInitialValue = (
	config: ProviderConfig | null | undefined
): ReasoningProviderFormValue => {
	const provider = (config?.provider ?? "deepseek") as ReasoningProviderValue;
	const preset = memoryReasoningPresets[provider];
	const metadata = config?.metadata as Record<string, unknown> | undefined;

	return {
		provider,
		protocol: config?.protocol ?? preset.protocol,
		model: config?.model || preset.model,
		apiKey: config?.apiKey ?? "",
		baseUrl: config?.baseUrl || preset.baseUrl,
		enabled: config?.enabled ?? true,
		digestThreshold:
			typeof metadata?.digestThreshold === "number"
				? metadata.digestThreshold
				: 50,
	};
};

function ChatProviderSection() {
	const queryClient = useQueryClient();
	const { data: config, isLoading } = useQuery({
		queryKey: ["config", "provider"],
		queryFn: () => api.config.provider.get(),
	});

	if (isLoading) {
		return (
			<Section description="用于日常对话主链的模型提供商" title="聊天模型">
				<Card size="sm">
					<CardContent className="text-muted-foreground text-sm">
						加载中…
					</CardContent>
				</Card>
			</Section>
		);
	}

	return (
		<ChatProviderForm
			initialValue={buildChatProviderInitialValue(config)}
			key={config?.id ?? "provider-config-chat-default"}
			onSaved={() => {
				queryClient.invalidateQueries({ queryKey: ["config", "provider"] });
			}}
		/>
	);
}

function ChatProviderForm({
	initialValue,
	onSaved,
}: {
	initialValue: ProviderFormValue<ProviderValue>;
	onSaved: () => void;
}) {
	const [submitError, setSubmitError] = useState<string | null>(null);
	const save = useMutation({
		mutationFn: async (value: ProviderFormValue<ProviderValue>) => {
			await api.config.provider.update({
				...value,
				metadata: {},
			});
		},
		onSuccess: onSaved,
	});

	const form = useForm({
		defaultValues: initialValue,
		validators: {
			onBlur: chatProviderFormSchema,
			onSubmit: chatProviderFormSchema,
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
		<Section description="用于日常对话主链的模型提供商" title="聊天模型">
			<form
				className="flex flex-col gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<form.Field name="provider">
					{(field) => (
						<FormFieldBlock
							error={
								field.state.meta.isTouched
									? readValidationMessage(field.state.meta.errors)
									: null
							}
							label="提供商"
						>
							<Select
								onValueChange={(value) => {
									if (!value) {
										return;
									}

									const currentProvider = field.state.value;
									const currentPreset = chatProviderPresets[currentProvider];
									const nextProvider = value as ProviderValue;
									const nextPreset = chatProviderPresets[nextProvider];
									const currentValues = form.state.values;

									field.handleChange(nextProvider);
									form.setFieldValue("protocol", nextPreset.protocol);

									if (
										shouldReplacePresetValue(
											currentValues.model,
											currentPreset.model
										)
									) {
										form.setFieldValue("model", nextPreset.model);
									}

									if (
										shouldReplacePresetValue(
											currentValues.baseUrl,
											currentPreset.baseUrl
										)
									) {
										form.setFieldValue("baseUrl", nextPreset.baseUrl);
									}
								}}
								value={field.state.value}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="mock">Mock</SelectItem>
									<SelectItem value="openai">OpenAI</SelectItem>
									<SelectItem value="openrouter">OpenRouter</SelectItem>
									<SelectItem value="anthropic">Anthropic</SelectItem>
									<SelectItem value="deepseek">DeepSeek</SelectItem>
									<SelectItem value="qwen">Qwen</SelectItem>
								</SelectContent>
							</Select>
						</FormFieldBlock>
					)}
				</form.Field>

				<form.Subscribe selector={(state) => state.values.provider}>
					{(provider) => {
						const preset = chatProviderPresets[provider as ProviderValue];

						return (
							<>
								<form.Field name="model">
									{(field) => (
										<FormFieldBlock
											error={
												field.state.meta.isTouched
													? readValidationMessage(field.state.meta.errors)
													: null
											}
											label="模型"
										>
											<Input
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												placeholder={preset.model}
												value={field.state.value}
											/>
										</FormFieldBlock>
									)}
								</form.Field>

								<form.Field name="protocol">
									{(field) => (
										<FormFieldBlock label="协议">
											<Input disabled value={field.state.value} />
										</FormFieldBlock>
									)}
								</form.Field>

								{preset.protocol === "mock" ? null : (
									<>
										<form.Field name="apiKey">
											{(field) => (
												<FormFieldBlock
													error={
														field.state.meta.isTouched
															? readValidationMessage(field.state.meta.errors)
															: null
													}
													label="API Key"
												>
													<Input
														onBlur={field.handleBlur}
														onChange={(event) =>
															field.handleChange(event.target.value)
														}
														placeholder={preset.apiKeyPlaceholder}
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
													hint={preset.note}
													label={getBaseUrlLabel(provider)}
												>
													<Input
														onBlur={field.handleBlur}
														onChange={(event) =>
															field.handleChange(event.target.value)
														}
														placeholder={preset.baseUrlPlaceholder}
														value={field.state.value}
													/>
												</FormFieldBlock>
											)}
										</form.Field>
									</>
								)}
							</>
						);
					}}
				</form.Subscribe>

				<form.Field name="enabled">
					{(field) => (
						<FormToggleField label="启用">
							<Switch
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</FormToggleField>
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

function MemoryEmbeddingSection() {
	const queryClient = useQueryClient();
	const { data: config, isLoading } = useQuery({
		queryKey: ["config", "provider", "memory_embedding"],
		queryFn: () => api.config.provider.memoryEmbedding.get(),
	});

	if (isLoading) {
		return (
			<Section
				description="用于记忆写入和 recall query 的文本 embedding"
				title="记忆向量化"
			>
				<Card size="sm">
					<CardContent className="text-muted-foreground text-sm">
						加载中…
					</CardContent>
				</Card>
			</Section>
		);
	}

	return (
		<MemoryEmbeddingForm
			initialValue={buildMemoryEmbeddingInitialValue(config)}
			key={config?.id ?? "provider-config-memory-embedding-default"}
			onSaved={() => {
				queryClient.invalidateQueries({
					queryKey: ["config", "provider", "memory_embedding"],
				});
			}}
		/>
	);
}

function MemoryEmbeddingForm({
	initialValue,
	onSaved,
}: {
	initialValue: ProviderFormValue<EmbeddingProviderValue>;
	onSaved: () => void;
}) {
	const [submitError, setSubmitError] = useState<string | null>(null);
	const save = useMutation({
		mutationFn: async (value: ProviderFormValue<EmbeddingProviderValue>) => {
			await api.config.provider.memoryEmbedding.update({
				...value,
				metadata: { dimension: 1024 },
			});
		},
		onSuccess: onSaved,
	});

	const form = useForm({
		defaultValues: initialValue,
		validators: {
			onBlur: embeddingProviderFormSchema,
			onSubmit: embeddingProviderFormSchema,
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
		<Section
			description="用于记忆写入和 recall query 的文本 embedding"
			title="记忆向量化"
		>
			<form
				className="flex flex-col gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<form.Field name="provider">
					{(field) => (
						<FormFieldBlock
							error={
								field.state.meta.isTouched
									? readValidationMessage(field.state.meta.errors)
									: null
							}
							label="提供商"
						>
							<Select
								onValueChange={(value) => {
									if (!value) {
										return;
									}

									const currentProvider = field.state.value;
									const currentPreset = memoryEmbeddingPresets[currentProvider];
									const nextProvider = value as EmbeddingProviderValue;
									const nextPreset = memoryEmbeddingPresets[nextProvider];
									const currentValues = form.state.values;

									field.handleChange(nextProvider);
									form.setFieldValue("protocol", nextPreset.protocol);

									if (
										shouldReplacePresetValue(
											currentValues.model,
											currentPreset.model
										)
									) {
										form.setFieldValue("model", nextPreset.model);
									}

									if (
										shouldReplacePresetValue(
											currentValues.baseUrl,
											currentPreset.baseUrl
										)
									) {
										form.setFieldValue("baseUrl", nextPreset.baseUrl);
									}
								}}
								value={field.state.value}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="qwen">Qwen</SelectItem>
									<SelectItem value="openai">OpenAI</SelectItem>
									<SelectItem value="openrouter">OpenRouter</SelectItem>
								</SelectContent>
							</Select>
						</FormFieldBlock>
					)}
				</form.Field>

				<form.Subscribe selector={(state) => state.values.provider}>
					{(provider) => {
						const preset =
							memoryEmbeddingPresets[provider as EmbeddingProviderValue];

						return (
							<>
								<form.Field name="model">
									{(field) => (
										<FormFieldBlock
											error={
												field.state.meta.isTouched
													? readValidationMessage(field.state.meta.errors)
													: null
											}
											label="Embedding 模型"
										>
											<Input
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												placeholder={preset.model}
												value={field.state.value}
											/>
										</FormFieldBlock>
									)}
								</form.Field>

								<form.Field name="protocol">
									{(field) => (
										<FormFieldBlock label="协议">
											<Input disabled value={field.state.value} />
										</FormFieldBlock>
									)}
								</form.Field>

								<FormFieldBlock label="向量维度">
									<Input disabled value="1024" />
								</FormFieldBlock>

								<form.Field name="apiKey">
									{(field) => (
										<FormFieldBlock
											error={
												field.state.meta.isTouched
													? readValidationMessage(field.state.meta.errors)
													: null
											}
											label="API Key"
										>
											<Input
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												placeholder={preset.apiKeyPlaceholder}
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
											hint={preset.note}
											label={getBaseUrlLabel(provider)}
										>
											<Input
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												placeholder={preset.baseUrlPlaceholder}
												value={field.state.value}
											/>
										</FormFieldBlock>
									)}
								</form.Field>
							</>
						);
					}}
				</form.Subscribe>

				<form.Field name="enabled">
					{(field) => (
						<FormToggleField label="启用">
							<Switch
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</FormToggleField>
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

function MemoryReasoningSection() {
	const queryClient = useQueryClient();
	const { data: config, isLoading } = useQuery({
		queryKey: ["config", "provider", "memory_reasoning"],
		queryFn: () => api.config.provider.memoryReasoning.get(),
	});

	if (isLoading) {
		return (
			<Section
				description="用于 digest 提取与 recall 前的判断和路由"
				title="记忆理解与路由"
			>
				<Card size="sm">
					<CardContent className="text-muted-foreground text-sm">
						加载中…
					</CardContent>
				</Card>
			</Section>
		);
	}

	return (
		<MemoryReasoningForm
			initialValue={buildMemoryReasoningInitialValue(config)}
			key={config?.id ?? "provider-config-memory-reasoning-default"}
			onSaved={() => {
				queryClient.invalidateQueries({
					queryKey: ["config", "provider", "memory_reasoning"],
				});
			}}
		/>
	);
}

function MemoryReasoningForm({
	initialValue,
	onSaved,
}: {
	initialValue: ReasoningProviderFormValue;
	onSaved: () => void;
}) {
	const [submitError, setSubmitError] = useState<string | null>(null);
	const save = useMutation({
		mutationFn: async (value: ReasoningProviderFormValue) => {
			await api.config.provider.memoryReasoning.update({
				provider: value.provider,
				protocol: value.protocol,
				model: value.model,
				apiKey: value.apiKey,
				baseUrl: value.baseUrl,
				enabled: value.enabled,
				metadata: {
					digestThreshold: value.digestThreshold,
				},
			});
		},
		onSuccess: onSaved,
	});

	const form = useForm({
		defaultValues: initialValue,
		validators: {
			onBlur: reasoningProviderFormSchema,
			onSubmit: reasoningProviderFormSchema,
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
		<Section
			description="用于 digest 提取与 recall 前的判断和路由"
			title="记忆理解与路由"
		>
			<form
				className="flex flex-col gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<form.Field name="provider">
					{(field) => (
						<FormFieldBlock
							error={
								field.state.meta.isTouched
									? readValidationMessage(field.state.meta.errors)
									: null
							}
							label="提供商"
						>
							<Select
								onValueChange={(value) => {
									if (!value) {
										return;
									}

									const currentProvider = field.state.value;
									const currentPreset = memoryReasoningPresets[currentProvider];
									const nextProvider = value as ReasoningProviderValue;
									const nextPreset = memoryReasoningPresets[nextProvider];
									const currentValues = form.state.values;

									field.handleChange(nextProvider);
									form.setFieldValue("protocol", nextPreset.protocol);

									if (
										shouldReplacePresetValue(
											currentValues.model,
											currentPreset.model
										)
									) {
										form.setFieldValue("model", nextPreset.model);
									}

									if (
										shouldReplacePresetValue(
											currentValues.baseUrl,
											currentPreset.baseUrl
										)
									) {
										form.setFieldValue("baseUrl", nextPreset.baseUrl);
									}
								}}
								value={field.state.value}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="deepseek">DeepSeek</SelectItem>
									<SelectItem value="openai">OpenAI</SelectItem>
									<SelectItem value="openrouter">OpenRouter</SelectItem>
									<SelectItem value="qwen">Qwen</SelectItem>
								</SelectContent>
							</Select>
						</FormFieldBlock>
					)}
				</form.Field>

				<form.Subscribe selector={(state) => state.values.provider}>
					{(provider) => {
						const preset =
							memoryReasoningPresets[provider as ReasoningProviderValue];

						return (
							<>
								<form.Field name="model">
									{(field) => (
										<FormFieldBlock
											error={
												field.state.meta.isTouched
													? readValidationMessage(field.state.meta.errors)
													: null
											}
											label="Reasoning 模型"
										>
											<Input
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												placeholder={preset.model}
												value={field.state.value}
											/>
										</FormFieldBlock>
									)}
								</form.Field>

								<form.Field name="protocol">
									{(field) => (
										<FormFieldBlock label="协议">
											<Input disabled value={field.state.value} />
										</FormFieldBlock>
									)}
								</form.Field>

								<form.Field name="apiKey">
									{(field) => (
										<FormFieldBlock
											error={
												field.state.meta.isTouched
													? readValidationMessage(field.state.meta.errors)
													: null
											}
											label="API Key"
										>
											<Input
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												placeholder={preset.apiKeyPlaceholder}
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
											hint={preset.note}
											label={getBaseUrlLabel(provider)}
										>
											<Input
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												placeholder={preset.baseUrlPlaceholder}
												value={field.state.value}
											/>
										</FormFieldBlock>
									)}
								</form.Field>

								<form.Field name="digestThreshold">
									{(field) => (
										<FormFieldBlock
											error={
												field.state.meta.isTouched
													? readValidationMessage(field.state.meta.errors)
													: null
											}
											hint={`当前阈值 ${field.state.value}`}
											label="自动摘要阈值（消息数）"
										>
											<Slider
												max={100}
												min={10}
												onValueChange={(values) =>
													field.handleChange(getSliderValue(values, 50))
												}
												step={10}
												value={[field.state.value]}
											/>
										</FormFieldBlock>
									)}
								</form.Field>
							</>
						);
					}}
				</form.Subscribe>

				<form.Field name="enabled">
					{(field) => (
						<FormToggleField label="启用">
							<Switch
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</FormToggleField>
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

export {
	ChatProviderSection,
	JevDecisionSection,
	MemoryEmbeddingSection,
	MemoryReasoningSection,
};

const jevProviderFormSchema = z.object({
	model: z.string().trim().min(1).max(120),
	apiKey: z.string().trim().max(400),
	baseUrl: z.url().max(500),
	enabled: z.boolean(),
	timeoutMs: z.number().int().min(500).max(30_000),
	maxRetries: z.number().int().min(0).max(3),
	retrievalShadowEnabled: z.boolean(),
	graphV2ShadowEnabled: z.boolean(),
	evidenceRelevanceShadowEnabled: z.boolean(),
	retrievalRoutingEnabled: z.boolean(),
	retrievalConfidenceThreshold: z.number().min(0).max(1),
	retrievalMinComparedPairs: z.number().int().min(0).max(10_000),
	retrievalMinAgreementRate: z.number().min(0).max(1),
	retrievalMaxAverageLatencyMs: z.number().int().min(1).max(30_000),
	retrievalMaxProviderErrorRate: z.number().min(0).max(1),
	nextActionShadowEnabled: z.boolean(),
});

type JevProviderFormValue = z.infer<typeof jevProviderFormSchema>;

const buildJevProviderInitialValue = (
	config: ProviderConfig | null | undefined
): JevProviderFormValue => {
	const metadata = config?.metadata as Record<string, unknown> | undefined;
	return {
		model: config?.model || "typesafe/jev-1.14",
		apiKey: config?.apiKey ?? "",
		baseUrl: config?.baseUrl || "https://openrouter.ai/api/alpha/decisions",
		enabled: config?.enabled ?? false,
		timeoutMs:
			typeof metadata?.timeoutMs === "number" ? metadata.timeoutMs : 3000,
		maxRetries:
			typeof metadata?.maxRetries === "number" ? metadata.maxRetries : 1,
		retrievalShadowEnabled: metadata?.retrievalShadowEnabled === true,
		graphV2ShadowEnabled: metadata?.graphV2ShadowEnabled === true,
		evidenceRelevanceShadowEnabled:
			metadata?.evidenceRelevanceShadowEnabled === true,
		retrievalRoutingEnabled: metadata?.retrievalRoutingEnabled === true,
		retrievalConfidenceThreshold:
			typeof metadata?.retrievalConfidenceThreshold === "number"
				? metadata.retrievalConfidenceThreshold
				: 0.85,
		retrievalMinComparedPairs:
			typeof metadata?.retrievalMinComparedPairs === "number"
				? metadata.retrievalMinComparedPairs
				: 20,
		retrievalMinAgreementRate:
			typeof metadata?.retrievalMinAgreementRate === "number"
				? metadata.retrievalMinAgreementRate
				: 0.85,
		retrievalMaxAverageLatencyMs:
			typeof metadata?.retrievalMaxAverageLatencyMs === "number"
				? metadata.retrievalMaxAverageLatencyMs
				: 3000,
		retrievalMaxProviderErrorRate:
			typeof metadata?.retrievalMaxProviderErrorRate === "number"
				? metadata.retrievalMaxProviderErrorRate
				: 0.05,
		nextActionShadowEnabled: metadata?.nextActionShadowEnabled === true,
	};
};

function JevDecisionSection() {
	const queryClient = useQueryClient();
	const { data: config, isLoading } = useQuery({
		queryKey: ["config", "provider", "jev"],
		queryFn: () => api.config.provider.jev.get(),
	});

	if (isLoading) {
		return (
			<Section
				description="通过 OpenRouter 执行受限的结构化判断"
				title="Jev 决策模型"
			>
				<Card size="sm">
					<CardContent className="text-muted-foreground text-sm">
						加载中…
					</CardContent>
				</Card>
			</Section>
		);
	}

	return (
		<JevDecisionForm
			initialValue={buildJevProviderInitialValue(config)}
			key={config?.id ?? "provider-config-decision-jev-default"}
			onSaved={() =>
				queryClient.invalidateQueries({
					queryKey: ["config", "provider", "jev"],
				})
			}
		/>
	);
}

function JevDecisionForm({
	initialValue,
	onSaved,
}: {
	initialValue: JevProviderFormValue;
	onSaved: () => void;
}) {
	const [submitError, setSubmitError] = useState<string | null>(null);
	const save = useMutation({
		mutationFn: async (value: JevProviderFormValue) => {
			await api.config.provider.jev.update({
				provider: "openrouter",
				protocol: "openai",
				model: value.model,
				apiKey: value.apiKey,
				baseUrl: value.baseUrl,
				enabled: value.enabled,
				metadata: {
					timeoutMs: value.timeoutMs,
					maxRetries: value.maxRetries,
					retrievalShadowEnabled: value.retrievalShadowEnabled,
					graphV2ShadowEnabled: value.graphV2ShadowEnabled,
					evidenceRelevanceShadowEnabled: value.evidenceRelevanceShadowEnabled,
					retrievalRoutingEnabled: value.retrievalRoutingEnabled,
					retrievalConfidenceThreshold: value.retrievalConfidenceThreshold,
					retrievalMinComparedPairs: value.retrievalMinComparedPairs,
					retrievalMinAgreementRate: value.retrievalMinAgreementRate,
					retrievalMaxAverageLatencyMs: value.retrievalMaxAverageLatencyMs,
					retrievalMaxProviderErrorRate: value.retrievalMaxProviderErrorRate,
					nextActionShadowEnabled: value.nextActionShadowEnabled,
				},
			});
		},
		onSuccess: onSaved,
	});
	const form = useForm({
		defaultValues: initialValue,
		validators: {
			onBlur: jevProviderFormSchema,
			onSubmit: jevProviderFormSchema,
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
		<Section
			description="OpenRouter 将请求转发给 TypeSafe Jev。它只产生带概率的判断，不能调用工具或执行动作。"
			title="Jev 决策模型"
		>
			<form
				className="flex flex-col gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<FormFieldBlock label="提供商">
					<Input disabled value="OpenRouter（Decisions API）" />
				</FormFieldBlock>
				<form.Field name="model">
					{(field) => (
						<FormFieldBlock
							error={
								field.state.meta.isTouched
									? readValidationMessage(field.state.meta.errors)
									: null
							}
							label="模型"
						>
							<Input
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder="typesafe/jev-1.14"
								value={field.state.value}
							/>
						</FormFieldBlock>
					)}
				</form.Field>
				<form.Field name="apiKey">
					{(field) => (
						<FormFieldBlock
							error={
								field.state.meta.isTouched
									? readValidationMessage(field.state.meta.errors)
									: null
							}
							label="OpenRouter API Key"
						>
							<Input
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder="sk-or-v1-..."
								type="password"
								value={field.state.value}
							/>
							{initialValue.apiKey.length === 0 ? (
								<span className="text-muted-foreground text-sm">
									保存后不会再次显示密钥；已有设置留空会保留，首次保存需要填写。
								</span>
							) : null}
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
							hint="默认使用 OpenRouter 的 /api/alpha/decisions。"
							label="Decisions API URL"
						>
							<Input
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								value={field.state.value}
							/>
						</FormFieldBlock>
					)}
				</form.Field>
				<form.Field name="timeoutMs">
					{(field) => (
						<FormFieldBlock label="超时（毫秒）">
							<Input
								onBlur={field.handleBlur}
								onChange={(event) =>
									field.handleChange(Number(event.target.value))
								}
								type="number"
								value={String(field.state.value)}
							/>
						</FormFieldBlock>
					)}
				</form.Field>
				<form.Field name="maxRetries">
					{(field) => (
						<FormFieldBlock label="瞬态错误重试次数">
							<Input
								onBlur={field.handleBlur}
								onChange={(event) =>
									field.handleChange(Number(event.target.value))
								}
								type="number"
								value={String(field.state.value)}
							/>
						</FormFieldBlock>
					)}
				</form.Field>
				<form.Field name="retrievalShadowEnabled">
					{(field) => (
						<FormToggleField label="记录检索 Shadow 判断">
							<Switch
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</FormToggleField>
					)}
				</form.Field>
				<form.Field name="graphV2ShadowEnabled">
					{(field) => (
						<FormToggleField label="记录 Graph v2 保守检索 Shadow">
							<Switch
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</FormToggleField>
					)}
				</form.Field>
				<form.Field name="evidenceRelevanceShadowEnabled">
					{(field) => (
						<FormToggleField label="记录证据相关性 Shadow 评分">
							<Switch
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</FormToggleField>
					)}
				</form.Field>
				<form.Field name="retrievalRoutingEnabled">
					{(field) => (
						<FormToggleField label="允许已校准的检索抑制">
							<Switch
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</FormToggleField>
					)}
				</form.Field>
				<form.Field name="nextActionShadowEnabled">
					{(field) => (
						<FormToggleField label="记录下一步建议与打扰价值 Shadow">
							<Switch
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</FormToggleField>
					)}
				</form.Field>
				<form.Field name="retrievalConfidenceThreshold">
					{(field) => (
						<FormFieldBlock label="检索置信度阈值">
							<Input
								onBlur={field.handleBlur}
								onChange={(event) =>
									field.handleChange(Number(event.target.value))
								}
								step="0.01"
								type="number"
								value={String(field.state.value)}
							/>
						</FormFieldBlock>
					)}
				</form.Field>
				<form.Field name="retrievalMinComparedPairs">
					{(field) => (
						<FormFieldBlock label="发布门槛：最少对比样本">
							<Input
								onBlur={field.handleBlur}
								onChange={(event) =>
									field.handleChange(Number(event.target.value))
								}
								type="number"
								value={String(field.state.value)}
							/>
						</FormFieldBlock>
					)}
				</form.Field>
				<form.Field name="retrievalMinAgreementRate">
					{(field) => (
						<FormFieldBlock label="发布门槛：最低一致率">
							<Input
								onBlur={field.handleBlur}
								onChange={(event) =>
									field.handleChange(Number(event.target.value))
								}
								step="0.01"
								type="number"
								value={String(field.state.value)}
							/>
						</FormFieldBlock>
					)}
				</form.Field>
				<form.Field name="retrievalMaxAverageLatencyMs">
					{(field) => (
						<FormFieldBlock label="发布门槛：最大平均延迟（毫秒）">
							<Input
								onBlur={field.handleBlur}
								onChange={(event) =>
									field.handleChange(Number(event.target.value))
								}
								type="number"
								value={String(field.state.value)}
							/>
						</FormFieldBlock>
					)}
				</form.Field>
				<form.Field name="retrievalMaxProviderErrorRate">
					{(field) => (
						<FormFieldBlock label="发布门槛：最大 Provider 错误率">
							<Input
								onBlur={field.handleBlur}
								onChange={(event) =>
									field.handleChange(Number(event.target.value))
								}
								step="0.01"
								type="number"
								value={String(field.state.value)}
							/>
						</FormFieldBlock>
					)}
				</form.Field>
				<form.Field name="enabled">
					{(field) => (
						<FormToggleField label="启用 Jev">
							<Switch
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</FormToggleField>
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
