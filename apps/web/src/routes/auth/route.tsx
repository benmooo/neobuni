import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@neobuni/ui/components/card";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  component: AuthLayout,
});

const AUTH_PRINCIPLES = [
  {
    title: "Private",
    description: "每个账号都绑定自己的 personal profile。",
  },
  {
    title: "Soul",
    description: "人格底色由 runtime soul pipeline 驱动，不是松散 prompt。",
  },
  {
    title: "Memory",
    description: "记忆会回流到对话里，形成真正连续的陪伴。",
  },
] as const;

function AuthLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="justify-between">
            <CardHeader className="gap-4">
              <p className="text-[0.72rem] text-muted-foreground uppercase tracking-[0.32em]">
                Buni
              </p>
              <div className="space-y-3">
                <CardTitle className="max-w-xl text-4xl leading-[1.02] tracking-[-0.04em] sm:text-5xl">
                  一个克制、持续、会记住你的 AI 伴侣。
                </CardTitle>
                <CardDescription className="max-w-lg text-sm leading-7 sm:text-[0.96rem]">
                  登录后，你会进入自己的独立
                  profile。Soul、记忆、对话和日程都沿着同一条连续的关系线运行。
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {AUTH_PRINCIPLES.map((item) => (
                <Card key={item.title} size="sm">
                  <CardContent className="space-y-2">
                    <p className="text-[0.7rem] text-muted-foreground uppercase tracking-[0.24em]">
                      {item.title}
                    </p>
                    <p className="text-sm leading-6">{item.description}</p>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 sm:p-8">
              <Outlet />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
