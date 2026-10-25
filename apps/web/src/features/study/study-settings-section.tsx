import type { StudyGoalConfig } from "@neobuni/contracts";
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
import { useState } from "react";

import {
  useActivateStudyPlan,
  useGenerateStudyPlan,
  useStudyGoals,
  useUpdateStudyConfig,
} from "@/hooks/use-study";

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

  const addChannel = () => {
    const targetAlias = alias.trim();
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
            <Input
              aria-label="目标别名"
              onChange={(event) => setAlias(event.target.value)}
              placeholder="已配置的目标别名"
              value={alias}
            />
            <Button onClick={addChannel} type="button" variant="secondary">
              添加渠道
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            提醒只会在学习时间前发送，默认每天最多 2
            条；静默时段和当前时段不发送。
          </p>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
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
