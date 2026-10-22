import {
  type QqConfigSource,
  type QqTargetConfigInput,
  type QqTargetType,
  qqConfigInputSchema,
  qqConfigSchema,
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

const qqTargetFormSchema = z.object({
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
  targetType: z.enum(["group_openid", "user_openid"]),
  targetId: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
});

type QqTargetFormValue = QqTargetConfigInput;
type QqTargetDraft = QqTargetFormValue & {
  clientId: string;
};

interface QqFormValue {
  appId: string;
  appSecret: string;
  baseUrl: string;
  enabled: boolean;
  targets: QqTargetDraft[];
}

interface QqTargetTypeOption {
  hint: string;
  label: string;
  value: QqTargetType;
}

const QQ_BASE_URL_PLACEHOLDER = "https://api.sgroup.qq.com";

const QQ_TARGET_TYPE_OPTIONS: QqTargetTypeOption[] = [
  {
    value: "group_openid",
    label: "Group OpenID",
    hint: "QQ群目标。只有拿到 group_openid 后才能发送。",
  },
  {
    value: "user_openid",
    label: "User OpenID",
    hint: "QQ 单聊目标。只有拿到用户 openid 后才能发送。",
  },
];
const QQ_SECTION_DESCRIPTION = getMessagingPlatformDescription("qq");

const qqTargetDraftSchema = qqTargetFormSchema.extend({
  clientId: z.string().min(1),
});

const stripClientId = ({
  clientId: _clientId,
  ...target
}: QqTargetDraft): QqTargetFormValue => target;

const qqFormSchema = z
  .object({
    enabled: z.boolean(),
    appId: z.string().trim().max(200),
    appSecret: z.string().trim().max(400),
    baseUrl: z.string().trim().max(500),
    targets: z.array(qqTargetDraftSchema).max(100),
  })
  .superRefine((value, ctx) => {
    const result = qqConfigInputSchema.safeParse({
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
  input?: Partial<QqTargetFormValue>
): QqTargetDraft => ({
  clientId: crypto.randomUUID(),
  alias: input?.alias ?? "",
  label: input?.label ?? "",
  targetType: input?.targetType ?? "group_openid",
  targetId: input?.targetId ?? "",
  enabled: input?.enabled ?? true,
});

const toDraftTargets = (targets: QqTargetFormValue[]) =>
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

const fetchQqConfig = async () =>
  qqConfigSchema.parse(await api.config.messaging.qq.get());

const getQqSourceLabel = (source: QqConfigSource) => {
  if (source === "database") {
    return "数据库";
  }
  if (source === "env") {
    return "环境变量回退";
  }
  return "未配置";
};

function QqSection() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ["config", "qq"],
    queryFn: fetchQqConfig,
  });

  if (isLoading || !config) {
    return (
      <Section description={QQ_SECTION_DESCRIPTION} title="QQ 集成">
        <Card size="sm">
          <CardContent className="text-muted-foreground text-sm">
            加载中…
          </CardContent>
        </Card>
      </Section>
    );
  }

  return (
    <QqConfigForm
      initialValue={{
        enabled: config.enabled,
        appId: config.appId,
        appSecret: config.appSecret,
        baseUrl: config.baseUrl,
        targets: toDraftTargets(config.targets),
      }}
      key={config.id}
      onSaved={() => {
        queryClient.invalidateQueries({ queryKey: ["config", "qq"] });
      }}
      source={config.source}
    />
  );
}

function QqConfigForm({
  source,
  initialValue,
  onSaved,
}: {
  source: QqConfigSource;
  initialValue: QqFormValue;
  onSaved: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (value: QqFormValue) => {
      await api.config.messaging.qq.put({
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
      onBlur: qqFormSchema,
      onSubmit: qqFormSchema,
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
    <Section description={QQ_SECTION_DESCRIPTION} title="QQ 集成">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryChip label="来源" value={getQqSourceLabel(source)} />
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
        当前阶段只接入发送 API，不包含 webhook 入站。QQ
        官方文档当前写明主动推送能力已下线，所以没有 `event_id` / `msg_id`
        的情况下，主动推送请求即使发起成功，也大概率只会拿到官方错误；真正稳定可用的回复链路仍然依赖后续
        webhook 接入。
      </FieldHint>

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
                placeholder="填写 QQ 机器人 App ID"
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
                placeholder="填写 QQ 机器人 App Secret"
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
                placeholder={QQ_BASE_URL_PLACEHOLDER}
                value={field.state.value}
              />
            </FormFieldBlock>
          )}
        </form.Field>

        <form.Field name="enabled">
          {(field) => (
            <FormToggleField label="启用 QQ 发送">
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
                    {getMessagingTargetUsageHint("qq")}
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
                    {getMessagingTargetEmptyState("目标别名")}
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
                          QQ_TARGET_TYPE_OPTIONS.find(
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
                                  targetType: value as QqTargetType,
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
                            {QQ_TARGET_TYPE_OPTIONS.map((option) => (
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
                          placeholder="group_openid_xxx / user_openid_xxx"
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

export { QqSection };
