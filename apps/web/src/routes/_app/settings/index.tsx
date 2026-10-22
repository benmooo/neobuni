import type {
  AddressingMode,
  ClosenessLevel,
  InitiativeLevel,
  IntimacySignal,
  RelationshipFlavor,
  SoulConfig,
  VerbosityLevel,
} from "@neobuni/contracts";
import {
  type agentConfigSchema,
  type profileSchema,
  profileUpdateInputSchema,
} from "@neobuni/contracts";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@neobuni/ui/components/alert";
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
import { Textarea } from "@neobuni/ui/components/textarea";
import { type Theme, useTheme } from "@neobuni/ui/components/theme-provider";
import { cn } from "@neobuni/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { BuniAvatar } from "@/components/chat/BuniAvatar";
import { useChatDisplayPreferences } from "@/components/chat/chat-display-preferences";
import { FormFieldBlock } from "@/components/form/FormFieldBlock";
import { PageHeader } from "@/components/PageHeader";
import { DiscordSection } from "@/features/settings/discord-section";
import { FeishuSection } from "@/features/settings/feishu-section";
import {
  ChatProviderSection,
  JevDecisionSection,
  MemoryEmbeddingSection,
  MemoryReasoningSection,
} from "@/features/settings/provider-sections";
import { QqSection } from "@/features/settings/qq-section";
import {
  FieldHint,
  getMutationErrorMessage,
  Section,
  SectionGroup,
  SummaryChip,
} from "@/features/settings/shared";
import { TelegramSection } from "@/features/settings/telegram-section";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { readValidationMessage } from "@/lib/form-errors";

export const Route = createFileRoute("/_app/settings/")({
  component: SettingsPage,
});

type Profile = z.infer<typeof profileSchema>;
type AgentConfig = z.infer<typeof agentConfigSchema>;

interface SoulRelationshipOption {
  hint: string;
  label: string;
  value: RelationshipFlavor;
}

interface SoulLevelOption<T extends string> {
  hint: string;
  label: string;
  value: T;
}

type SettingsCategoryKey =
  | "account"
  | "appearance"
  | "buni"
  | "profile"
  | "models"
  | "integrations";

const THEMES: { key: Theme; label: string; description: string }[] = [
  {
    key: "neutral",
    label: "默认",
    description: "中性、克制、最接近系统默认。",
  },
  {
    key: "blossom",
    label: "樱花",
    description: "更柔和，适合轻一点的阅读氛围。",
  },
  {
    key: "lavender",
    label: "薰衣草",
    description: "偏冷静，适合更安静的界面语气。",
  },
  { key: "peach", label: "蜜桃", description: "更轻暖，但保持低饱和。" },
  { key: "matcha", label: "抹茶", description: "带一点自然感，但仍保持克制。" },
  { key: "midnight", label: "深夜", description: "更适合夜间使用。" },
];

const relationshipFlavorOptions: SoulRelationshipOption[] = [
  {
    value: "soft_companion",
    label: "陪伴感更强",
    hint: "更像稳定、克制的陪伴者，亲密感表达更淡一些。",
  },
  {
    value: "light_romantic",
    label: "轻微恋人感",
    hint: "保留一点亲密和偏爱感，但不过甜、不过界。",
  },
  {
    value: "caregiver_like",
    label: "更照顾型",
    hint: "更偏照看与安顿，适合希望被更稳地接住。",
  },
];

const closenessOptions: SoulLevelOption<ClosenessLevel>[] = [
  { value: "low", label: "克制", hint: "更注重距离感与分寸，靠近速度更慢。" },
  {
    value: "medium",
    label: "自然",
    hint: "保持稳定亲近，不冷淡也不过分黏连。",
  },
  {
    value: "high",
    label: "更亲近",
    hint: "更容易表达陪伴感和贴近感，但仍受边界约束。",
  },
];

const initiativeOptions: SoulLevelOption<InitiativeLevel>[] = [
  { value: "low", label: "少打扰", hint: "默认更克制，除非你明显需要。" },
  {
    value: "medium",
    label: "适度主动",
    hint: "会关心你，但不会一直刷存在感。",
  },
  {
    value: "high",
    label: "更常主动关心",
    hint: "更容易发起关心和跟进，但仍保留边界。",
  },
];

const verbosityOptions: SoulLevelOption<VerbosityLevel>[] = [
  { value: "low", label: "简短", hint: "更轻、更短，适合不想被长回复压住。" },
  { value: "medium", label: "适中", hint: "默认篇幅，兼顾温度和清晰度。" },
  { value: "high", label: "更展开", hint: "会更完整地接住你，也会说得更细。" },
];

const intimacyOptions: SoulLevelOption<IntimacySignal>[] = [
  {
    value: "none",
    label: "几乎不用",
    hint: "尽量不使用亲昵称呼或明显偏爱感表达。",
  },
  { value: "low", label: "很克制", hint: "偶尔带一点温度，但整体保持距离感。" },
  {
    value: "subtle",
    label: "微妙",
    hint: "有亲近感，但更像自然流露，不会太甜。",
  },
  {
    value: "low_to_medium",
    label: "偏亲近",
    hint: "会更稳定地表达喜欢和靠近感。",
  },
  {
    value: "medium",
    label: "明显亲近",
    hint: "日常表达会更有情侣感，但仍保留边界。",
  },
  {
    value: "moderate",
    label: "上限更高",
    hint: "允许在用户也给出信号时更自然地贴近。",
  },
];

const addressingModeOptions: SoulLevelOption<AddressingMode>[] = [
  {
    value: "user_name",
    label: "用你的名字",
    hint: "默认使用你填写的名字或昵称称呼你。",
  },
  {
    value: "preferred_name",
    label: "用指定称呼",
    hint: "优先用你提供的专属称呼，比如“宝宝”或“小A”。",
  },
];

const SETTINGS_CATEGORIES: Array<{
  key: SettingsCategoryKey;
  label: string;
  description: string;
}> = [
  { key: "account", label: "账号", description: "登录态、Profile 和时区" },
  { key: "appearance", label: "外观", description: "主题和聊天展示" },
  { key: "buni", label: "Buni", description: "形象、灵魂、互动风格" },
  { key: "profile", label: "你的资料", description: "长期上下文资料" },
  {
    key: "models",
    label: "模型与记忆",
    description: "主模型、Embedding、Reasoning",
  },
  {
    key: "integrations",
    label: "集成",
    description: "Discord、Telegram、Feishu、QQ 等外部通道",
  },
];

const fetchAgentConfig = async () => await api.config.agent.get();

const fetchSoulConfig = async () => await api.config.soul.get();

const fetchProfile = async () => await api.profile.get();

const getSelectedOption = <T extends string>(
  value: T,
  options: SoulLevelOption<T>[]
) => options.find((option) => option.value === value) ?? options[0];

const getSelectedRelationshipFlavor = (value: RelationshipFlavor) =>
  relationshipFlavorOptions.find((option) => option.value === value) ??
  relationshipFlavorOptions[0];

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const estimateDataUriBytes = (value: string) => {
  const [, payload = ""] = value.split(",", 2);
  return Math.floor((payload.length * 3) / 4);
};

const readFileAsDataUrl = async (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败。"));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });

const loadImage = async (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败。"));
    image.src = src;
  });

const compressAvatarFile = async (file: File) => {
  if (!file.type.startsWith("image/")) {
    throw new Error("只支持图片文件。");
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const maxEdge = 384;
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("浏览器当前无法处理图片。");
  }

  context.drawImage(image, 0, 0, width, height);

  const compressedDataUrl = canvas.toDataURL("image/webp", 0.86);

  if (estimateDataUriBytes(compressedDataUrl) > 350_000) {
    throw new Error("图片太大，请换一张更小的图片。");
  }

  return compressedDataUrl;
};

const intimacyOrder: Record<IntimacySignal, number> = {
  none: 0,
  low: 1,
  subtle: 2,
  low_to_medium: 3,
  medium: 4,
  moderate: 5,
};

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

const profileTimezoneFormSchema = z
  .object({
    timezone: z.string().trim().max(80),
  })
  .superRefine((value, ctx) => {
    const result = profileUpdateInputSchema.safeParse({
      timezone: value.timezone.length > 0 ? value.timezone : null,
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

const buniIdentityFormSchema = z.object({
  aiName: z.string().trim().min(1).max(80),
  avatarUri: z
    .string()
    .trim()
    .max(1_000_000)
    .refine(
      (value) =>
        value.length === 0 ||
        value.startsWith("data:image/") ||
        isHttpUrl(value),
      {
        message: "头像需要为空、图片链接，或本地上传后生成的图片数据。",
      }
    ),
});

const soulFormSchema = z
  .object({
    relationshipFlavor: z.enum([
      "soft_companion",
      "light_romantic",
      "caregiver_like",
    ]),
    closenessLevel: z.enum(["low", "medium", "high"]),
    initiativeLevel: z.enum(["low", "medium", "high"]),
    playfulness: z.number().min(0).max(1),
    directness: z.number().min(0).max(1),
    verbosity: z.enum(["low", "medium", "high"]),
    defaultIntimacy: z.enum([
      "none",
      "low",
      "subtle",
      "low_to_medium",
      "medium",
      "moderate",
    ]),
    maxIntimacy: z.enum([
      "none",
      "low",
      "subtle",
      "low_to_medium",
      "medium",
      "moderate",
    ]),
    addressingMode: z.enum(["user_name", "preferred_name"]),
    preferredAddress: z.string().trim().max(80),
  })
  .superRefine((value, ctx) => {
    if (
      intimacyOrder[value.defaultIntimacy] > intimacyOrder[value.maxIntimacy]
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxIntimacy"],
        message: "默认亲密度不能高于“无明确回应时的上限”。",
      });
    }

    if (
      value.addressingMode === "preferred_name" &&
      value.preferredAddress.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preferredAddress"],
        message: "选择“指定称呼”时，需要填写一个称呼。",
      });
    }
  });

const userProfileFormSchema = z.object({
  userName: z.string().trim().min(1).max(80),
  userPersona: z.string().trim().max(6000),
});

function ThemeSection() {
  const { theme, dark, setTheme, setDark } = useTheme();

  return (
    <Section description="选择主题色与深色模式" title="外观">
      <div className="grid grid-cols-3 gap-3">
        {THEMES.map(({ key, label, description }) => (
          <Button
            className="h-auto min-h-20 flex-col items-start gap-1 px-3 py-3 text-left"
            key={key}
            onClick={() => setTheme(key)}
            type="button"
            variant={theme === key ? "default" : "outline"}
          >
            <span>{label}</span>
            <span
              className={cn(
                "whitespace-normal text-[11px]",
                theme === key
                  ? "text-primary-foreground/80"
                  : "text-muted-foreground"
              )}
            >
              {description}
            </span>
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <label className="text-muted-foreground text-xs">深色模式</label>
        <Switch checked={dark} onCheckedChange={setDark} />
      </div>
    </Section>
  );
}

function ChatDisplaySection() {
  const { showThinking, setShowThinking } = useChatDisplayPreferences();

  return (
    <Section
      description="控制聊天页里推理过程和工具过程的展示方式。"
      title="聊天展示"
    >
      <Card size="sm">
        <CardContent className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-foreground text-sm">
              显示思考过程
            </div>
            <div className="mt-1 text-muted-foreground text-xs">
              关闭时只保留“正在思考”的状态文案；开启后 assistant
              消息会显示折叠的 thinking block。
            </div>
          </div>
          <Switch checked={showThinking} onCheckedChange={setShowThinking} />
        </CardContent>
      </Card>

      <FieldHint>
        这是当前设备的本地显示偏好，不会影响模型行为，也不会同步到其他设备。
      </FieldHint>
    </Section>
  );
}

const getCurrentBrowserTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function ProfileTimezoneSection() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  });

  const deviceTimezone = getCurrentBrowserTimezone();

  if (isLoading || !profile) {
    return (
      <Section
        description="这是 reminder scheduling 和时间推算的首选时区来源。未设置时，才会回退到当前设备时区或 server 默认值。"
        title="Profile 时区"
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
    <ProfileTimezoneForm
      deviceTimezone={deviceTimezone}
      key={profile.id}
      onSaved={() => {
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        queryClient.invalidateQueries({ queryKey: ["config", "runtime"] });
      }}
      profile={profile}
    />
  );
}

function ProfileTimezoneForm({
  profile,
  deviceTimezone,
  onSaved,
}: {
  profile: Profile;
  deviceTimezone: string;
  onSaved: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (value: { timezone: string }) => {
      await api.profile.update({
        timezone:
          value.timezone.trim().length > 0 ? value.timezone.trim() : null,
      });
    },
    onSuccess: onSaved,
  });

  const form = useForm({
    defaultValues: {
      timezone: profile.timezone ?? "",
    },
    validators: {
      onBlur: profileTimezoneFormSchema,
      onSubmit: profileTimezoneFormSchema,
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
      description="这是 reminder scheduling 和时间推算的首选时区来源。未设置时，才会回退到当前设备时区或 server 默认值。"
      title="Profile 时区"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryChip label="Profile ID" value={profile?.id ?? "加载中…"} />
        <SummaryChip label="当前保存" value={profile?.timezone ?? "未设置"} />
        <SummaryChip label="当前设备" value={deviceTimezone} />
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field name="timezone">
          {(field) => (
            <FormFieldBlock
              error={
                field.state.meta.isTouched
                  ? readValidationMessage(field.state.meta.errors)
                  : null
              }
              hint="使用 IANA timezone，例如 `Asia/Shanghai`、`America/Los_Angeles`。"
              label="Timezone"
            >
              <Input
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Asia/Shanghai"
                value={field.state.value}
              />
            </FormFieldBlock>
          )}
        </form.Field>

        {submitError ? (
          <FieldHint tone="destructive">{submitError}</FieldHint>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Button
            onClick={() => form.setFieldValue("timezone", deviceTimezone)}
            type="button"
            variant="outline"
          >
            使用当前设备时区
          </Button>

          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button disabled={!canSubmit} size="sm" type="submit">
                {isSubmitting ? "保存中…" : "保存"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Section>
  );
}

function BuniIdentitySection() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ["agent-config"],
    queryFn: fetchAgentConfig,
  });

  if (isLoading || !config) {
    return (
      <Section
        description="名字和头像都属于视觉身份层，不进入 soul runtime。"
        title="Buni 形象"
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
    <BuniIdentityForm
      config={config}
      key={config.id}
      onSaved={() => {
        queryClient.invalidateQueries({ queryKey: ["agent-config"] });
      }}
    />
  );
}

function BuniIdentityForm({
  config,
  onSaved,
}: {
  config: AgentConfig;
  onSaved: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarLinkInput, setAvatarLinkInput] = useState(
    config.avatarUri?.startsWith("http") ? config.avatarUri : ""
  );
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (value: { aiName: string; avatarUri: string }) => {
      await api.config.agent.update({
        aiName: value.aiName,
        avatarUri: value.avatarUri,
        userName: config.userName,
        userPersona: config.userPersona,
      });
    },
    onSuccess: onSaved,
  });

  const form = useForm({
    defaultValues: {
      aiName: config.aiName ?? "Buni",
      avatarUri: config.avatarUri ?? "",
    },
    validators: {
      onBlur: buniIdentityFormSchema,
      onSubmit: buniIdentityFormSchema,
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

  const handleAvatarFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsProcessingAvatar(true);
    setAvatarError(null);

    try {
      const compressedAvatarUri = await compressAvatarFile(file);
      form.setFieldValue("avatarUri", compressedAvatarUri);
      setAvatarLinkInput("");
    } catch (error) {
      setAvatarError(
        error instanceof Error
          ? error.message
          : "处理头像失败，请换一张图重试。"
      );
    } finally {
      setIsProcessingAvatar(false);
      event.target.value = "";
    }
  };

  const applyAvatarLink = () => {
    const normalizedLink = avatarLinkInput.trim();

    if (normalizedLink.length === 0) {
      form.setFieldValue("avatarUri", "");
      setAvatarError(null);
      return;
    }

    if (!isHttpUrl(normalizedLink)) {
      setAvatarError("请填写可直接访问的图片链接。");
      return;
    }

    setAvatarLinkInput(normalizedLink);
    form.setFieldValue("avatarUri", normalizedLink);
    setAvatarError(null);
  };

  const resetAvatar = () => {
    form.setFieldValue("avatarUri", "");
    setAvatarLinkInput("");
    setAvatarError(null);
  };

  return (
    <Section
      description="名字和头像都属于视觉身份层，不进入 soul runtime。"
      title="Buni 形象"
    >
      <Card size="sm">
        <CardContent className="flex items-center gap-4">
          <BuniAvatar
            aiName={form.state.values.aiName}
            avatarUri={form.state.values.avatarUri}
            fallbackClassName="text-sm"
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground text-sm">头像预览</div>
            <div className="mt-1 text-muted-foreground text-xs">
              未设置时会回退到默认头像。上传图片会在本地压缩后再保存。
            </div>
          </div>
        </CardContent>
      </Card>

      <input
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => void handleAvatarFileChange(event)}
        ref={fileInputRef}
        type="file"
      />

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field name="aiName">
          {(field) => (
            <FormFieldBlock
              error={
                field.state.meta.isTouched
                  ? readValidationMessage(field.state.meta.errors)
                  : null
              }
              label="名字"
            >
              <Input
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Buni"
                value={field.state.value}
              />
            </FormFieldBlock>
          )}
        </form.Field>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isProcessingAvatar}
            onClick={() => fileInputRef.current?.click()}
            type="button"
            variant="outline"
          >
            {isProcessingAvatar ? "处理图片中…" : "选择本地图片"}
          </Button>
          <Button
            disabled={isProcessingAvatar}
            onClick={resetAvatar}
            type="button"
            variant="outline"
          >
            重置头像
          </Button>
        </div>

        <form.Field name="avatarUri">
          {(field) => (
            <FormFieldBlock
              error={
                field.state.meta.isTouched
                  ? readValidationMessage(field.state.meta.errors)
                  : null
              }
              hint="支持 `png`、`jpg`、`webp`，也支持直接粘贴远程图片链接。"
              label="图片链接"
            >
              <div className="flex flex-col gap-2 md:flex-row">
                <Input
                  onBlur={field.handleBlur}
                  onChange={(event) => setAvatarLinkInput(event.target.value)}
                  placeholder="https://example.com/buni-avatar.webp"
                  value={avatarLinkInput}
                />
                <Button
                  onClick={applyAvatarLink}
                  type="button"
                  variant="outline"
                >
                  使用链接
                </Button>
              </div>
            </FormFieldBlock>
          )}
        </form.Field>

        {avatarError ? (
          <FieldHint tone="destructive">{avatarError}</FieldHint>
        ) : null}
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

function SoulSection() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ["config", "soul"],
    queryFn: fetchSoulConfig,
  });

  if (isLoading || !config) {
    return (
      <Section
        description="这里只开放能被稳定理解的 Soul 字段。守护评估、stance 切换和 response planner 继续由系统内核管理。"
        title="灵魂设定"
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
    <SoulSectionForm
      config={config}
      key={config.id}
      onSaved={() => {
        queryClient.invalidateQueries({ queryKey: ["config", "soul"] });
      }}
    />
  );
}

function SoulSectionForm({
  config,
  onSaved,
}: {
  config: SoulConfig;
  onSaved: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (value: z.infer<typeof soulFormSchema>) => {
      await api.config.soul.update({
        name: config.name,
        temperament: {
          ...config.temperament,
          playfulness: value.playfulness,
          directness: value.directness,
        },
        relationship: {
          ...config.relationship,
          relationshipFlavor: value.relationshipFlavor,
          closenessLevel: value.closenessLevel,
          initiativeLevel: value.initiativeLevel,
        },
        values: config.values,
        drives: config.drives,
        expression: {
          ...config.expression,
          verbosity: value.verbosity,
          intimacy: {
            default: value.defaultIntimacy,
            maxWithoutUserSignal: value.maxIntimacy,
          },
          addressing: {
            mode: value.addressingMode,
            preferredName: value.preferredAddress.trim(),
          },
        },
      });
    },
    onSuccess: onSaved,
  });

  const form = useForm({
    defaultValues: {
      relationshipFlavor: config.relationship.relationshipFlavor,
      closenessLevel: config.relationship.closenessLevel,
      initiativeLevel: config.relationship.initiativeLevel,
      playfulness: config.temperament.playfulness,
      directness: config.temperament.directness,
      verbosity: config.expression.verbosity,
      defaultIntimacy: config.expression.intimacy.default,
      maxIntimacy: config.expression.intimacy.maxWithoutUserSignal,
      addressingMode: config.expression.addressing.mode,
      preferredAddress: config.expression.addressing.preferredName,
    },
    validators: {
      onBlur: soulFormSchema,
      onSubmit: soulFormSchema,
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

  const selectedRelationshipFlavor = getSelectedRelationshipFlavor(
    form.state.values.relationshipFlavor
  );
  const selectedCloseness = getSelectedOption(
    form.state.values.closenessLevel,
    closenessOptions
  );
  const selectedInitiative = getSelectedOption(
    form.state.values.initiativeLevel,
    initiativeOptions
  );
  const selectedVerbosity = getSelectedOption(
    form.state.values.verbosity,
    verbosityOptions
  );
  const selectedDefaultIntimacy = getSelectedOption(
    form.state.values.defaultIntimacy,
    intimacyOptions
  );
  const selectedMaxIntimacy = getSelectedOption(
    form.state.values.maxIntimacy,
    intimacyOptions
  );
  const selectedAddressingMode = getSelectedOption(
    form.state.values.addressingMode,
    addressingModeOptions
  );

  return (
    <Section
      description="这里只开放能被稳定理解的 Soul 字段。守护评估、stance 切换和 response planner 继续由系统内核管理。"
      title="灵魂设定"
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <form.Field name="relationshipFlavor">
            {(field) => (
              <FormFieldBlock label="关系风格">
                <Select
                  onValueChange={(value) =>
                    value && field.handleChange(value as RelationshipFlavor)
                  }
                  value={field.state.value}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {relationshipFlavorOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormFieldBlock>
            )}
          </form.Field>

          <form.Field name="closenessLevel">
            {(field) => (
              <FormFieldBlock label="亲近程度">
                <Select
                  onValueChange={(value) =>
                    value && field.handleChange(value as ClosenessLevel)
                  }
                  value={field.state.value}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {closenessOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormFieldBlock>
            )}
          </form.Field>

          <form.Field name="initiativeLevel">
            {(field) => (
              <FormFieldBlock label="主动性">
                <Select
                  onValueChange={(value) =>
                    value && field.handleChange(value as InitiativeLevel)
                  }
                  value={field.state.value}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {initiativeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormFieldBlock>
            )}
          </form.Field>
        </div>

        <FieldHint>{selectedRelationshipFlavor.hint}</FieldHint>
        <FieldHint>{selectedCloseness.hint}</FieldHint>
        <FieldHint>{selectedInitiative.hint}</FieldHint>

        <form.Field name="playfulness">
          {(field) => (
            <FormFieldBlock
              hint="越高越容易出现轻松、调皮的表达；越低越稳、更收着说。"
              label="轻松感"
            >
              <Slider
                max={1}
                min={0}
                onValueChange={(values) =>
                  field.handleChange(getSliderValue(values, 0.4))
                }
                step={0.05}
                value={[field.state.value]}
              />
            </FormFieldBlock>
          )}
        </form.Field>

        <form.Field name="directness">
          {(field) => (
            <FormFieldBlock
              hint="越高越直接、越少绕弯；越低越委婉、更柔和。"
              label="直给程度"
            >
              <Slider
                max={1}
                min={0}
                onValueChange={(values) =>
                  field.handleChange(getSliderValue(values, 0.35))
                }
                step={0.05}
                value={[field.state.value]}
              />
            </FormFieldBlock>
          )}
        </form.Field>

        <form.Field name="verbosity">
          {(field) => (
            <FormFieldBlock label="回复篇幅">
              <Select
                onValueChange={(value) =>
                  value && field.handleChange(value as VerbosityLevel)
                }
                value={field.state.value}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {verbosityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldBlock>
          )}
        </form.Field>

        <FieldHint>{selectedVerbosity.hint}</FieldHint>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <form.Field name="defaultIntimacy">
            {(field) => (
              <FormFieldBlock label="默认亲密度">
                <Select
                  onValueChange={(value) =>
                    value && field.handleChange(value as IntimacySignal)
                  }
                  value={field.state.value}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {intimacyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormFieldBlock>
            )}
          </form.Field>

          <form.Field name="maxIntimacy">
            {(field) => (
              <FormFieldBlock
                error={
                  field.state.meta.isTouched
                    ? readValidationMessage(field.state.meta.errors)
                    : null
                }
                label="无明确回应时的上限"
              >
                <Select
                  onValueChange={(value) =>
                    value && field.handleChange(value as IntimacySignal)
                  }
                  value={field.state.value}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {intimacyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormFieldBlock>
            )}
          </form.Field>
        </div>

        <FieldHint>{selectedDefaultIntimacy.hint}</FieldHint>
        <FieldHint>{selectedMaxIntimacy.hint}</FieldHint>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <form.Field name="addressingMode">
            {(field) => (
              <FormFieldBlock label="称呼方式">
                <Select
                  onValueChange={(value) =>
                    value && field.handleChange(value as AddressingMode)
                  }
                  value={field.state.value}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {addressingModeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormFieldBlock>
            )}
          </form.Field>

          <form.Field name="preferredAddress">
            {(field) => (
              <FormFieldBlock
                error={
                  field.state.meta.isTouched
                    ? readValidationMessage(field.state.meta.errors)
                    : null
                }
                label="指定称呼"
              >
                <Input
                  disabled={
                    form.state.values.addressingMode !== "preferred_name"
                  }
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="比如：宝宝、小A、阿卡"
                  value={field.state.value}
                />
              </FormFieldBlock>
            )}
          </form.Field>
        </div>

        <FieldHint>{selectedAddressingMode.hint}</FieldHint>
        {form.state.values.addressingMode === "preferred_name" &&
        form.state.values.preferredAddress.trim().length > 0 ? (
          <FieldHint>
            Buni 会优先用 “{form.state.values.preferredAddress.trim()}”
            来称呼你。
          </FieldHint>
        ) : null}

        <Alert>
          <AlertTitle>灵魂摘要</AlertTitle>
          <AlertDescription className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <SummaryChip
              label="关系角色"
              value="温柔陪伴者（gentle_companion）"
            />
            <SummaryChip label="守护策略" value="默认克制，异常时升级守护" />
            <SummaryChip
              label="当前关系风格"
              value={selectedRelationshipFlavor.label}
            />
            <SummaryChip label="当前亲近程度" value={selectedCloseness.label} />
            <SummaryChip label="当前主动性" value={selectedInitiative.label} />
            <SummaryChip
              label="默认亲密度"
              value={selectedDefaultIntimacy.label}
            />
            <SummaryChip
              label="称呼方式"
              value={selectedAddressingMode.label}
            />
            <SummaryChip
              label="驱动顺序"
              value="respect > comfort > continuity > protection > progress > connection"
            />
          </AlertDescription>
        </Alert>

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
              {isSubmitting ? "保存中…" : "保存 Soul"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </Section>
  );
}

function UserProfileSection() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ["agent-config"],
    queryFn: fetchAgentConfig,
  });

  if (isLoading || !config) {
    return (
      <Section
        description="这些信息会进入长期上下文，帮助 Buni 更稳定地理解你。"
        title="你的资料"
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
    <UserProfileForm
      config={config}
      key={config.id}
      onSaved={() => {
        queryClient.invalidateQueries({ queryKey: ["agent-config"] });
      }}
    />
  );
}

function UserProfileForm({
  config,
  onSaved,
}: {
  config: AgentConfig;
  onSaved: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (value: z.infer<typeof userProfileFormSchema>) => {
      await api.config.agent.update({
        aiName: config.aiName,
        avatarUri: config.avatarUri,
        userName: value.userName,
        userPersona: value.userPersona,
      });
    },
    onSuccess: onSaved,
  });

  const form = useForm({
    defaultValues: {
      userName: config.userName ?? "You",
      userPersona: config.userPersona ?? "",
    },
    validators: {
      onBlur: userProfileFormSchema,
      onSubmit: userProfileFormSchema,
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
      description="这些信息会进入长期上下文，帮助 Buni 更稳定地理解你。"
      title="你的资料"
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field name="userName">
          {(field) => (
            <FormFieldBlock
              error={
                field.state.meta.isTouched
                  ? readValidationMessage(field.state.meta.errors)
                  : null
              }
              label="你的名字"
            >
              <Input
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="You"
                value={field.state.value}
              />
            </FormFieldBlock>
          )}
        </form.Field>

        <form.Field name="userPersona">
          {(field) => (
            <FormFieldBlock label="关于你">
              <Textarea
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="你的兴趣、节奏、偏好、希望 Buni 记住的事..."
                rows={4}
                value={field.state.value}
              />
            </FormFieldBlock>
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

function SettingsPage() {
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategoryKey>("account");

  const handleSignOut = async () => {
    const result = await authClient.signOut();

    if (result.error) {
      return;
    }

    await navigate({ to: "/" });
  };

  return (
    <div className="flex h-screen flex-col">
      <PageHeader title="设置" />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-6">
          <Section
            description="一次只打开一个设置域，减少表单噪音。"
            title="设置导航"
          >
            <div className="flex flex-wrap gap-2">
              {SETTINGS_CATEGORIES.map((category) => (
                <Button
                  className="rounded-xl"
                  key={category.key}
                  onClick={() => setActiveCategory(category.key)}
                  type="button"
                  variant={
                    activeCategory === category.key ? "default" : "outline"
                  }
                >
                  {category.label}
                </Button>
              ))}
            </div>
            <FieldHint>
              {
                SETTINGS_CATEGORIES.find(
                  (category) => category.key === activeCategory
                )?.description
              }
            </FieldHint>
          </Section>

          {activeCategory === "account" && (
            <SectionGroup
              description="当前登录用户与 active profile。"
              title="账号"
            >
              <Section
                description="Buni 的 profile 隔离和设置读写都绑定到当前登录态。"
                title="会话"
              >
                <Card size="sm">
                  <CardContent className="text-sm">
                    <p className="font-medium text-foreground">
                      {session.data?.user.email ?? "加载中…"}
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs">
                      当前 Profile:{" "}
                      {session.data?.session.activeProfileId ?? "未分配"}
                    </p>
                  </CardContent>
                </Card>
                <Button
                  className="self-end rounded-xl"
                  disabled={session.isPending}
                  onClick={handleSignOut}
                  variant="outline"
                >
                  退出登录
                </Button>
              </Section>
              <ProfileTimezoneSection />
            </SectionGroup>
          )}

          {activeCategory === "appearance" && (
            <SectionGroup description="视觉主题和阅读模式。" title="外观">
              <ThemeSection />
              <ChatDisplaySection />
            </SectionGroup>
          )}

          {activeCategory === "buni" && (
            <SectionGroup
              description="管理 Buni 的名字、灵魂投影，以及默认互动方式。"
              title="Buni"
            >
              <BuniIdentitySection />
              <SoulSection />
            </SectionGroup>
          )}

          {activeCategory === "profile" && (
            <SectionGroup
              description="帮助 Buni 以更稳定的长期上下文理解你。"
              title="你的资料"
            >
              <UserProfileSection />
            </SectionGroup>
          )}

          {activeCategory === "models" && (
            <SectionGroup
              description="聊天主链、记忆、以及 Jev 结构化决策的 provider 设置。"
              title="模型与记忆"
            >
              <ChatProviderSection />
              <MemoryEmbeddingSection />
              <MemoryReasoningSection />
              <JevDecisionSection />
            </SectionGroup>
          )}

          {activeCategory === "integrations" && (
            <SectionGroup
              description="外部发送通道和目标地址管理。"
              title="集成"
            >
              <DiscordSection />
              <TelegramSection />
              <FeishuSection />
              <QqSection />
            </SectionGroup>
          )}
        </div>
      </div>
    </div>
  );
}
