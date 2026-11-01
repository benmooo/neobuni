import type {
  StudyGoalConfig,
  StudyNudgeSettings,
  StudyScoutRunResult,
  StudyScoutSettings,
} from "@neobuni/contracts";
import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import { Badge } from "@neobuni/ui/components/badge";
import { Button } from "@neobuni/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@neobuni/ui/components/card";
import { Input } from "@neobuni/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@neobuni/ui/components/select";
import { Spinner } from "@neobuni/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useTelegramChannelTargets } from "@/hooks/use-goals";
import {
  useActivateStudyPlan,
  useGenerateStudyPlan,
  useRunStudyScout,
  useSendStudyReminderTest,
  useStudyGoals,
  useUpdateStudyConfig,
} from "@/hooks/use-study";
import { api } from "@/lib/api";

const PLATFORM_LABELS = {
  discord: "Discord",
  feishu: "飞书",
  qq: "QQ",
  telegram: "Telegram",
} as const;

const PLATFORMS = ["telegram", "discord", "feishu", "qq"] as const;
const DAYS = [
  { label: "日", value: 0 },
  { label: "一", value: 1 },
  { label: "二", value: 2 },
  { label: "三", value: 3 },
  { label: "四", value: 4 },
  { label: "五", value: 5 },
  { label: "六", value: 6 },
];

const NUDGE_TOGGLES: { key: keyof StudyNudgeSettings; label: string }[] = [
  { key: "dailyPlan", label: "每日计划" },
  { key: "sessionDue", label: "开课前" },
  { key: "streakRecovery", label: "断签挽回" },
  { key: "reviewDue", label: "复习到期" },
  { key: "wrapUp", label: "收尾复盘" },
];

const PER_DAY_OPTIONS = [1, 2, 3] as const;
const SCOUT_KIND_LABELS = {
  article: "文章",
  news: "新闻",
  outline: "大纲",
  "past-exam": "真题",
} as const;
const DEFAULT_ALLOWLIST = ["ruankao.org.cn", "github.com", "zhihu.com"];

const parseAllowlist = (value: string): string[] =>
  value
    .split(/[,，\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function StudySettingsForm({
  config,
  goalId,
}: {
  config: StudyGoalConfig;
  goalId: string;
}) {
  const update = useUpdateStudyConfig(goalId);
  const generate = useGenerateStudyPlan(goalId);
  const activate = useActivateStudyPlan(goalId);
  const [targetDate, setTargetDate] = useState(config.targetAt.slice(0, 10));
  const [dailyMinutes, setDailyMinutes] = useState(config.dailyMinutes);
  const [windowStart, setWindowStart] = useState(config.studyWindow.start);
  const [windowEnd, setWindowEnd] = useState(config.studyWindow.end);
  const [restDays, setRestDays] = useState<number[]>(config.restDays);
  const [quietEnabled, setQuietEnabled] = useState(config.quietHours !== null);
  const [quietStart, setQuietStart] = useState(
    config.quietHours?.start ?? "23:30"
  );
  const [quietEnd, setQuietEnd] = useState(config.quietHours?.end ?? "07:30");
  const [channels, setChannels] = useState(config.channels);
  const [platform, setPlatform] =
    useState<(typeof PLATFORMS)[number]>("telegram");
  const [alias, setAlias] = useState("");
  const [selectedTarget, setSelectedTarget] = useState("");
  const [nudges, setNudges] = useState<StudyNudgeSettings>({
    dailyPlan: true,
    reviewDue: true,
    sessionDue: true,
    streakRecovery: true,
    wrapUp: true,
    ...config.nudges,
  });
  const [testResult, setTestResult] = useState<string | null>(null);
  const [scout, setScout] = useState<StudyScoutSettings>({
    enabled: true,
    minRerankScore: 1.5,
    perDay: 2,
    siteAllowlist: DEFAULT_ALLOWLIST,
    ...config.scout,
  });
  const [allowlistText, setAllowlistText] = useState(
    (config.scout?.siteAllowlist ?? DEFAULT_ALLOWLIST).join(", ")
  );
  const [scoutResult, setScoutResult] = useState<StudyScoutRunResult | null>(
    null
  );
  const runScout = useRunStudyScout(goalId);
  const webSearchProvider = useQuery({
    queryKey: ["config", "provider", "web_search"],
    queryFn: () => api.config.provider.webSearch.get(),
    staleTime: 60_000,
  });
  const search = webSearchProvider.data;
  const hasSearchKey = Boolean(search?.enabled) && Boolean(search?.apiKey);
  const telegramTargets = useTelegramChannelTargets();
  const testReminder = useSendStudyReminderTest(goalId);
  const telegramConfig = useQuery({
    queryKey: ["config", "messaging", "telegram"],
    queryFn: () => api.config.messaging.telegram.get(),
    staleTime: 60_000,
  });
  const botUsername =
    typeof telegramConfig.data?.metadata?.botUsername === "string"
      ? telegramConfig.data.metadata.botUsername
      : "";
  const [saved, setSaved] = useState(false);
  const [replanned, setReplanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (day: number) => {
    setRestDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort()
    );
  };

  const toggleNudge = (key: keyof StudyNudgeSettings) => {
    setNudges((current) => ({ ...current, [key]: !current[key] }));
  };

  const sendTest = async () => {
    setError(null);
    setTestResult(null);
    try {
      const result = await testReminder.mutateAsync();
      setTestResult(
        result.delivered > 0
          ? `已发送到 ${result.delivered} 个渠道。`
          : `没有发送成功${result.errors.length > 0 ? `：${result.errors.join("；")}` : "：还没有配置渠道。"}`
      );
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const addChannel = () => {
    const targetAlias =
      platform === "telegram" ? selectedTarget.trim() : alias.trim();
    if (!targetAlias) {
      return;
    }
    if (
      channels.some(
        (channel) =>
          channel.platform === platform && channel.targetAlias === targetAlias
      )
    ) {
      return;
    }
    setChannels((current) => [
      ...current,
      { platform, targetAlias, targetId: null },
    ]);
    setAlias("");
    setSelectedTarget("");
  };

  const findMaterial = async () => {
    setError(null);
    setScoutResult(null);
    try {
      const result = await runScout.mutateAsync();
      setScoutResult(result);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const toggleScout = () => {
    if (!hasSearchKey) {
      return;
    }
    setScout((current) => ({ ...current, enabled: !current.enabled }));
  };

  const replan = async () => {
    setError(null);
    setSaved(false);
    setReplanned(false);
    try {
      const generated = await generate.mutateAsync();
      await activate.mutateAsync(generated.plan.id);
      setReplanned(true);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const save = async () => {
    setError(null);
    setSaved(false);
    if (!targetDate) {
      setError("请选择考试日期。");
      return;
    }
    if (windowStart >= windowEnd) {
      setError("学习开始时间必须早于结束时间。");
      return;
    }
    if (quietEnabled && quietStart === quietEnd) {
      setError("静默时段的开始和结束不能相同。");
      return;
    }
    const next: StudyGoalConfig = {
      ...config,
      channels,
      dailyMinutes,
      nudges,
      scout: { ...scout, siteAllowlist: parseAllowlist(allowlistText) },
      quietHours: quietEnabled ? { end: quietEnd, start: quietStart } : null,
      restDays,
      studyWindow: { end: windowEnd, start: windowStart },
      targetAt: new Date(`${targetDate}T00:00:00.000Z`).toISOString(),
    };
    try {
      await update.mutateAsync(next);
      setSaved(true);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">学习节奏</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground text-xs">考试日期</span>
              <Input
                disabled={update.isPending}
                onChange={(event) => setTargetDate(event.target.value)}
                type="date"
                value={targetDate}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground text-xs">每天分钟</span>
              <Input
                disabled={update.isPending}
                min={15}
                onChange={(event) =>
                  setDailyMinutes(Number(event.target.value))
                }
                type="number"
                value={dailyMinutes}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground text-xs">学习开始</span>
              <Input
                disabled={update.isPending}
                onChange={(event) => setWindowStart(event.target.value)}
                type="time"
                value={windowStart}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground text-xs">学习结束</span>
              <Input
                disabled={update.isPending}
                onChange={(event) => setWindowEnd(event.target.value)}
                type="time"
                value={windowEnd}
              />
            </label>
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">休息日</p>
            <div className="flex gap-1">
              {DAYS.map((day) => (
                <Button
                  key={day.value}
                  onClick={() => toggleDay(day.value)}
                  size="sm"
                  type="button"
                  variant={restDays.includes(day.value) ? "default" : "outline"}
                >
                  {day.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">主动提醒</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setQuietEnabled((current) => !current)}
              size="sm"
              type="button"
              variant={quietEnabled ? "default" : "outline"}
            >
              {quietEnabled ? "静默时段已开" : "静默时段已关"}
            </Button>
            {quietEnabled ? (
              <>
                <Input
                  aria-label="静默开始"
                  onChange={(event) => setQuietStart(event.target.value)}
                  type="time"
                  value={quietStart}
                />
                <Input
                  aria-label="静默结束"
                  onChange={(event) => setQuietEnd(event.target.value)}
                  type="time"
                  value={quietEnd}
                />
              </>
            ) : null}
          </div>

          <div className="space-y-2">
            {channels.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                还没有提醒渠道。添加一个已配置好的通道后，Buni
                会在学习时间前推送今天这一步。
              </p>
            ) : (
              channels.map((channel) => (
                <div
                  className="flex items-center justify-between gap-2"
                  key={`${channel.platform}:${channel.targetAlias ?? channel.targetId}`}
                >
                  <Badge variant="secondary">
                    {PLATFORM_LABELS[channel.platform]} ·{" "}
                    {channel.targetAlias ?? channel.targetId}
                  </Badge>
                  <Button
                    onClick={() =>
                      setChannels((current) =>
                        current.filter(
                          (item) =>
                            !(
                              item.platform === channel.platform &&
                              item.targetAlias === channel.targetAlias &&
                              item.targetId === channel.targetId
                            )
                        )
                      )
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    移除
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              onValueChange={(value) =>
                setPlatform(value as (typeof PLATFORMS)[number])
              }
              value={platform}
            >
              <SelectTrigger aria-label="提醒平台">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {PLATFORM_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {platform === "telegram" && telegramTargets.data?.length ? (
              <Select
                onValueChange={(value) => setSelectedTarget(value ?? "")}
                value={selectedTarget}
              >
                <SelectTrigger aria-label="Telegram 目标">
                  <SelectValue placeholder="选择已配置的 Telegram 目标" />
                </SelectTrigger>
                <SelectContent>
                  {telegramTargets.data.map((target) => (
                    <SelectItem key={target.alias} value={target.alias}>
                      {target.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                aria-label="目标别名"
                onChange={(event) => setAlias(event.target.value)}
                placeholder="已配置的目标别名"
                value={alias}
              />
            )}
            <Button onClick={addChannel} type="button" variant="secondary">
              添加渠道
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={testReminder.isPending}
              onClick={() => void sendTest()}
              type="button"
              variant="outline"
            >
              {testReminder.isPending ? (
                <>
                  <Spinner className="size-3.5" />
                  发送中…
                </>
              ) : (
                "发送测试提醒"
              )}
            </Button>
            {botUsername ? (
              <Button
                onClick={() =>
                  window.open(
                    `https://t.me/${botUsername}?start=bunistudy_${goalId}`,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
                type="button"
                variant="ghost"
              >
                在 Telegram 里一键绑定
              </Button>
            ) : null}
          </div>
          {testResult ? (
            <p className="text-muted-foreground text-xs">{testResult}</p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            提醒只会在学习时段前后发送：时段前 30 分钟、开课前 1 小时、收尾前 15
            分钟，每天最多 3 条；静默时段不发送。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">提醒内容</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {NUDGE_TOGGLES.map((item) => (
              <Button
                key={item.key}
                onClick={() => toggleNudge(item.key)}
                size="sm"
                type="button"
                variant={nudges[item.key] ? "default" : "outline"}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            每条提醒最多 3 行，带「开始学习 / 30 分钟后 / 改到明晚 /
            今晚跳过」按钮。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">每日精选材料</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!hasSearchKey}
              onClick={toggleScout}
              size="sm"
              type="button"
              variant={scout.enabled && hasSearchKey ? "default" : "outline"}
            >
              {scout.enabled && hasSearchKey ? "精选已开" : "精选已关"}
            </Button>
            <span className="text-muted-foreground text-xs">每天</span>
            {PER_DAY_OPTIONS.map((value) => (
              <Button
                key={value}
                onClick={() =>
                  setScout((current) => ({ ...current, perDay: value }))
                }
                size="sm"
                type="button"
                variant={scout.perDay === value ? "default" : "outline"}
              >
                {value} 条
              </Button>
            ))}
          </div>

          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground text-xs">
              优先站点（可留空，用逗号分隔）
            </span>
            <Input
              disabled={update.isPending}
              onChange={(event) => setAllowlistText(event.target.value)}
              placeholder="ruankao.org.cn, github.com, zhihu.com"
              value={allowlistText}
            />
          </label>

          {hasSearchKey ? null : (
            <p className="text-muted-foreground text-xs">
              当前 profile 未配置搜索密钥，无法联网检索。到「模型与记忆 ›
              联网搜索」填一个 DeepSeek 平台 API Key 即可使用（与推理 provider
              分开计费）。
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={runScout.isPending || !hasSearchKey}
              onClick={() => void findMaterial()}
              type="button"
              variant="outline"
            >
              {runScout.isPending ? (
                <>
                  <Spinner className="size-3.5" />
                  正在检索…
                </>
              ) : (
                "立刻找一次"
              )}
            </Button>
            <p className="text-muted-foreground text-xs">
              只做预览，不会推送到渠道。
            </p>
          </div>

          {scoutResult ? (
            <div className="space-y-2 border-t pt-2">
              <p className="text-muted-foreground text-xs">
                {scoutResult.queryCount} 条查询 · {scoutResult.candidateCount}{" "}
                个候选 · {scoutResult.picks.length} 条精选
              </p>
              {scoutResult.picks.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {scoutResult.available
                    ? "这次没有达到质量线的材料，稍后再试试。"
                    : (scoutResult.reason ?? "当前无法联网检索。")}
                </p>
              ) : (
                scoutResult.picks.map((pick) => (
                  <div className="space-y-0.5" key={pick.url}>
                    <a
                      className="line-clamp-2 text-sm hover:text-primary"
                      href={pick.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {pick.title}
                    </a>
                    <p className="text-muted-foreground text-xs">
                      {pick.host} · {SCOUT_KIND_LABELS[pick.kind]} · {pick.why}
                    </p>
                  </div>
                ))
              )}
              {scoutResult.errors.length > 0 ? (
                <p className="text-destructive text-xs">
                  {scoutResult.errors.join("；")}
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="text-muted-foreground text-xs">
            学习时段开始前 30
            分钟推送，按最近学过的内容和薄弱点检索，每日上限与上面提醒共享。
          </p>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          {" "}
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {saved ? (
        <Alert>
          <AlertDescription>
            已保存。新的提醒配置会从下一次 tick 开始生效。
          </AlertDescription>
        </Alert>
      ) : null}
      {replanned ? (
        <Alert>
          <AlertDescription>已按当前设置重新生成计划并排期。</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-2">
        <Button disabled={update.isPending} onClick={() => void save()}>
          {update.isPending ? "保存中…" : "保存学习设置"}
        </Button>
        <Button
          disabled={generate.isPending || activate.isPending}
          onClick={() => void replan()}
          variant="secondary"
        >
          {generate.isPending || activate.isPending
            ? "重新排期中…"
            : "重新生成并排期"}
        </Button>
        <p className="text-muted-foreground text-xs">
          修改节奏后点"重新生成并排期"，会保留已完成课程的掌握度。
        </p>
      </div>
    </div>
  );
}

function StudySettingsSection() {
  const goals = useStudyGoals();
  const studyGoal = goals.data?.[0] ?? null;

  if (goals.isLoading) {
    return <p className="text-muted-foreground text-sm">正在读取学习目标…</p>;
  }

  if (!studyGoal) {
    return (
      <Card>
        <CardContent className="py-4 text-muted-foreground text-sm">
          还没有学习目标。先在 Now
          页面创建「系统架构设计师」学习目标，再回来配置提醒。
        </CardContent>
      </Card>
    );
  }

  return (
    <StudySettingsForm
      config={studyGoal.config}
      goalId={studyGoal.goal.id}
      key={studyGoal.goal.id}
    />
  );
}

export { StudySettingsSection };
