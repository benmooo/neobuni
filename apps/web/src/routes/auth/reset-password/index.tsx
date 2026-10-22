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
import { getAuthErrorMessage } from "@/lib/auth-flow";

const resetPasswordSearchSchema = z.object({
	token: z.string().optional(),
	error: z.string().optional(),
});

const resetPasswordSchema = z
	.object({
		password: z.string().min(8, "密码至少需要 8 位。"),
		confirmPassword: z.string().min(1, "请再次输入密码。"),
	})
	.refine((value) => value.password === value.confirmPassword, {
		message: "两次输入的密码不一致。",
		path: ["confirmPassword"],
	});

export const Route = createFileRoute("/auth/reset-password/")({
	validateSearch: resetPasswordSearchSchema,
	component: ResetPasswordPage,
});

const getResetPasswordErrorMessage = (error: string | undefined) => {
	if (error === "INVALID_TOKEN") {
		return "这个重置链接无效或已经过期了，请重新申请一次密码重置邮件。";
	}

	return "当前没有可用的密码重置 token，请重新发起忘记密码流程。";
};

function ResetPasswordPage() {
	const search = Route.useSearch();
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [didReset, setDidReset] = useState(false);

	const form = useForm({
		defaultValues: {
			password: "",
			confirmPassword: "",
		},
		validators: {
			onBlur: resetPasswordSchema,
			onSubmit: resetPasswordSchema,
		},
		onSubmit: async ({ value }) => {
			if (!search.token) {
				setSubmitError("缺少重置 token，请重新申请一次重置邮件。");
				return;
			}

			setSubmitError(null);

			const result = await authClient.resetPassword({
				token: search.token,
				newPassword: value.password,
			});

			if (result.error) {
				setSubmitError(
					getAuthErrorMessage(result.error, "密码重置失败，请稍后重试。")
				);
				return;
			}

			setDidReset(true);
		},
	});

	if (didReset) {
		return (
			<div className="flex h-full flex-col justify-between gap-8">
				<div className="space-y-4">
					<p className="text-[0.72rem] text-muted-foreground uppercase tracking-[0.3em]">
						Reset password
					</p>
					<div className="space-y-2">
						<h2 className="font-semibold text-3xl text-foreground tracking-[-0.04em]">
							新密码已经生效。
						</h2>
						<p className="max-w-sm text-muted-foreground text-sm leading-6">
							现在你可以回到登录页，用新的密码进入 Buni。
						</p>
					</div>
				</div>

				<div className="space-y-4">
					<Link
						className={authPrimaryActionClassName}
						search={{ reset: "1" }}
						to="/auth/sign-in"
					>
						返回登录
					</Link>

					<AuthFooter>
						<Link
							className={authInlineLinkClassName}
							to="/auth/forgot-password"
						>
							重新申请重置邮件
						</Link>
					</AuthFooter>
				</div>
			</div>
		);
	}

	if (search.error || !search.token) {
		return (
			<div className="flex h-full flex-col justify-between gap-8">
				<div className="space-y-4">
					<p className="text-[0.72rem] text-muted-foreground uppercase tracking-[0.3em]">
						Reset password
					</p>
					<div className="space-y-2">
						<h2 className="font-semibold text-3xl text-foreground tracking-[-0.04em]">
							这个重置链接不可用了。
						</h2>
						<p className="max-w-sm text-muted-foreground text-sm leading-6">
							{getResetPasswordErrorMessage(search.error)}
						</p>
					</div>
				</div>

				<div className="space-y-4">
					<Link
						className={authPrimaryActionClassName}
						to="/auth/forgot-password"
					>
						重新发送重置邮件
					</Link>

					<AuthFooter>
						<Link className={authInlineLinkClassName} to="/auth/sign-in">
							返回登录
						</Link>
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
					Reset password
				</p>
				<div className="space-y-2">
					<h2 className="font-semibold text-3xl text-foreground tracking-[-0.04em]">
						设置一个新的密码。
					</h2>
					<p className="max-w-sm text-muted-foreground text-sm leading-6">
						这次修改只影响当前账号的登录密码，不会重置你的 profile、Soul
						或记忆。
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
							label="新密码"
						>
							<Input
								autoComplete="new-password"
								className="h-12"
								id={field.name}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder="设置一个新的安全密码"
								type="password"
								value={field.state.value}
							/>
						</AuthField>
					)}
				</form.Field>

				<form.Field name="confirmPassword">
					{(field) => (
						<AuthField
							error={
								field.state.meta.isTouched
									? readValidationMessage(field.state.meta.errors)
									: null
							}
							htmlFor={field.name}
							label="确认密码"
						>
							<Input
								autoComplete="new-password"
								className="h-12"
								id={field.name}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder="再输入一次新密码"
								type="password"
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
							{isSubmitting ? <Spinner className="size-4" /> : "更新密码"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<AuthFooter>
				<Link className={authInlineLinkClassName} to="/auth/sign-in">
					返回登录
				</Link>
				<Link className={authInlineLinkClassName} to="/auth/forgot-password">
					重新发送邮件
				</Link>
			</AuthFooter>
		</div>
	);
}
