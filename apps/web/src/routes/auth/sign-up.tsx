import { Button } from "@neobuni/ui/components/button";
import { Input } from "@neobuni/ui/components/input";
import { Spinner } from "@neobuni/ui/components/spinner";
import { useForm } from "@tanstack/react-form";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { AuthField } from "@/components/auth/AuthField";
import {
  createBlurThenChangeValidators,
  readValidationMessage,
} from "@/components/auth/auth-form";
import {
  AuthFooter,
  AuthNotice,
  authInlineLinkClassName,
  authPrimaryActionClassName,
} from "@/components/auth/auth-ui";
import { authClient } from "@/lib/auth-client";
import {
  getAuthErrorMessage,
  resolvePostSignUpRedirect,
} from "@/lib/auth-flow";

const signUpSchema = z.object({
  name: z.string().trim().min(1, "请输入昵称。"),
  email: z.email("请输入有效的邮箱地址。"),
  password: z.string().min(8, "密码至少需要 8 位。"),
});

export const Route = createFileRoute("/auth/sign-up")({
  beforeLoad: async () => {
    const session = await authClient.getSession();

    if (session.data) {
      throw redirect({ to: "/chat" });
    }
  },
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    validators: createBlurThenChangeValidators(signUpSchema),
    onSubmit: async ({ value }) => {
      setSubmitError(null);

      const result = await authClient.signUp.email(value);

      if (result.error) {
        setSubmitError(
          getAuthErrorMessage(result.error, "注册失败，请稍后重试。")
        );
        return;
      }

      const session = await authClient.getSession();

      await navigate(
        resolvePostSignUpRedirect({ hasSession: Boolean(session.data) })
      );
    },
  });

  return (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="space-y-3">
        <p className="text-[0.72rem] text-muted-foreground uppercase tracking-[0.3em]">
          Sign up
        </p>
        <div className="space-y-2">
          <h2 className="font-semibold text-3xl text-foreground tracking-[-0.04em]">
            创建一条新的关系线。
          </h2>
          <p className="max-w-sm text-muted-foreground text-sm leading-6">
            输入昵称、邮箱和密码后，就可以直接创建你的 Buni 账号。
          </p>
        </div>
      </div>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <AuthField
              error={
                field.state.meta.isTouched
                  ? readValidationMessage(field.state.meta.errors)
                  : null
              }
              htmlFor={field.name}
              label="昵称"
            >
              <Input
                autoComplete="name"
                className="h-12"
                id={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="你想让 Buni 怎么称呼你"
                value={field.state.value}
              />
            </AuthField>
          )}
        </form.Field>

        <form.Field name="email">
          {(field) => (
            <AuthField
              error={
                field.state.meta.isTouched
                  ? readValidationMessage(field.state.meta.errors)
                  : null
              }
              htmlFor={field.name}
              label="邮箱"
            >
              <Input
                autoComplete="email"
                className="h-12"
                id={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="you@example.com"
                type="email"
                value={field.state.value}
              />
            </AuthField>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <AuthField
              error={
                field.state.meta.isTouched
                  ? readValidationMessage(field.state.meta.errors)
                  : null
              }
              hint="8+ chars"
              htmlFor={field.name}
              label="密码"
            >
              <Input
                autoComplete="new-password"
                className="h-12"
                id={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="设置一个安全密码"
                type="password"
                value={field.state.value}
              />
            </AuthField>
          )}
        </form.Field>

        {submitError ? (
          <AuthNotice tone="destructive">{submitError}</AuthNotice>
        ) : null}

        <AuthNotice>
          如果这个邮箱已经注册，请直接登录；如果当前浏览器没有拿到
          session，也可以在下一步直接登录。
        </AuthNotice>

        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <Button
              className={authPrimaryActionClassName}
              disabled={!canSubmit}
              type="submit"
            >
              {isSubmitting ? <Spinner className="size-4" /> : "创建账号"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <AuthFooter prompt="已经有账号了？">
        <Link className={authInlineLinkClassName} to="/auth/sign-in">
          返回登录
        </Link>
      </AuthFooter>
    </div>
  );
}
