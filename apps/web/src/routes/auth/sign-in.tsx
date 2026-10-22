import { Button } from "@neobuni/ui/components/button";
import { Input } from "@neobuni/ui/components/input";
import { toast } from "@neobuni/ui/components/sonner";
import { Spinner } from "@neobuni/ui/components/spinner";
import { useForm } from "@tanstack/react-form";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
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
import { resolveSignInFailureToast } from "@/lib/auth-flow";

const signInSchema = z.object({
  email: z.email("请输入有效的邮箱地址。"),
  password: z.string().min(1, "请输入密码。"),
});

const signInSearchSchema = z.object({
  registered: z.string().optional(),
  reset: z.string().optional(),
});

export const Route = createFileRoute("/auth/sign-in")({
  validateSearch: signInSearchSchema,
  beforeLoad: async () => {
    const session = await authClient.getSession();

    if (session.data) {
      throw redirect({ to: "/chat" });
    }
  },
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: createBlurThenChangeValidators(signInSchema),
    onSubmit: async ({ value }) => {
      const result = await authClient.signIn.email(value);

      if (result.error) {
        const failureToast = resolveSignInFailureToast(result.error);

        toast.error(failureToast.message, { id: failureToast.id });
        return;
      }

      await navigate({ to: "/chat" });
    },
  });

  return (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="space-y-3">
        <p className="text-[0.72rem] text-muted-foreground uppercase tracking-[0.3em]">
          Sign in
        </p>
        <div className="space-y-2">
          <h2 className="font-semibold text-3xl text-foreground tracking-[-0.04em]">
            回到你的 Buni。
          </h2>
          <p className="max-w-sm text-muted-foreground text-sm leading-6">
            进入你自己的记忆与关系上下文，不共享，不混淆。
          </p>
        </div>
      </div>

      {search.registered ? (
        <AuthNotice>账号已经创建完成，现在可以直接登录。</AuthNotice>
      ) : null}

      {search.reset ? (
        <AuthNotice>密码已经更新完成，请使用新密码登录。</AuthNotice>
      ) : null}

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
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
              hint="private"
              htmlFor={field.name}
              label="密码"
            >
              <Input
                autoComplete="current-password"
                className="h-12"
                id={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="输入你的密码"
                type="password"
                value={field.state.value}
              />
            </AuthField>
          )}
        </form.Field>

        <div className="flex justify-end">
          <Link className={authInlineLinkClassName} to="/auth/forgot-password">
            忘记密码？
          </Link>
        </div>

        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <Button
              className={authPrimaryActionClassName}
              disabled={!canSubmit}
              type="submit"
            >
              {isSubmitting ? <Spinner className="size-4" /> : "登录"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <AuthFooter prompt="还没有账号？">
        <Link className={authInlineLinkClassName} to="/auth/sign-up">
          创建一个
        </Link>
      </AuthFooter>
    </div>
  );
}
