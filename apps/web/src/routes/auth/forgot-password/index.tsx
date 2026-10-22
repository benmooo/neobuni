import { Button } from "@neobuni/ui/components/button";
import { Input } from "@neobuni/ui/components/input";
import { Spinner } from "@neobuni/ui/components/spinner";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { AuthField } from "@/components/auth/AuthField";
import { readValidationMessage } from "@/components/auth/auth-form";
import {
	AuthFooter,
	AuthNotice,
	authInlineLinkClassName,
	authPrimaryActionClassName,
} from "@/components/auth/auth-ui";
import { authClient } from "@/lib/auth-client";
import { buildAuthCallbackUrl, getAuthErrorMessage } from "@/lib/auth-flow";

const forgotPasswordSchema = z.object({
	email: z.email("请输入有效的邮箱地址。"),
});

export const Route = createFileRoute("/auth/forgot-password/")({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			email: "",
		},
		validators: {
			onBlur: forgotPasswordSchema,
			onSubmit: forgotPasswordSchema,
		},
		onSubmit: async ({ value }) => {
			setSubmitError(null);

			const result = await authClient.requestPasswordReset({
				email: value.email,
				redirectTo: buildAuthCallbackUrl("/auth/reset-password"),
			});

			if (result.error) {
				setSubmitError(
					getAuthErrorMessage(result.error, "发送重置邮件失败，请稍后重试。")
				);
				return;
			}

			setSubmittedEmail(value.email);
		},
	});

	if (submittedEmail) {
		return (
			<div className="flex h-full flex-col justify-between gap-8">
				<div className="space-y-4">
					<p className="text-[0.72rem] text-muted-foreground uppercase tracking-[0.3em]">
						Forgot password
					</p>
					<div className="space-y-2">
						<h2 className="font-semibold text-3xl text-foreground tracking-[-0.04em]">
							去邮箱收一下重置链接。
						</h2>
						<p className="max-w-sm text-muted-foreground text-sm leading-6">
							如果 {submittedEmail}{" "}
							在系统中存在，我们已经发送了一封密码重置邮件。
						</p>
					</div>
					<AuthNotice>
						<p>邮件里的链接会把你带回重置密码页面。</p>
						<p className="mt-2">
							如果没有收到，请检查垃圾箱，或者稍后重新提交一次。
						</p>
					</AuthNotice>
				</div>

				<div className="space-y-4">
					<Link className={authPrimaryActionClassName} to="/auth/sign-in">
						返回登录
					</Link>

					<AuthFooter>
						<button
							className={authInlineLinkClassName}
							onClick={() => setSubmittedEmail(null)}
							type="button"
						>
							重新填写邮箱
						</button>
						<Link className={authInlineLinkClassName} to="/auth/sign-up">
							创建账号
						</Link>
					</AuthFooter>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col justify-between gap-8">
			<div className="space-y-3">
				<p className="text-[0.72rem] text-muted-foreground uppercase tracking-[0.3em]">
					Forgot password
				</p>
				<div className="space-y-2">
					<h2 className="font-semibold text-3xl text-foreground tracking-[-0.04em]">
						先把登录入口找回来。
					</h2>
					<p className="max-w-sm text-muted-foreground text-sm leading-6">
						输入你的邮箱，我们会发一封密码重置邮件给你。
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

				{submitError ? (
					<AuthNotice tone="destructive">{submitError}</AuthNotice>
				) : null}

				<form.Subscribe
					selector={(state) => [state.canSubmit, state.isSubmitting]}
				>
					{([canSubmit, isSubmitting]) => (
						<Button
							className={authPrimaryActionClassName}
							disabled={!canSubmit}
							type="submit"
						>
							{isSubmitting ? <Spinner className="size-4" /> : "发送重置邮件"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<AuthFooter>
				<Link className={authInlineLinkClassName} to="/auth/sign-in">
					返回登录
				</Link>
				<Link className={authInlineLinkClassName} to="/auth/sign-up">
					创建账号
				</Link>
			</AuthFooter>
		</div>
	);
}
