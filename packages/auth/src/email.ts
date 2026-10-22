import { Resend } from "resend";

type AuthEmailUser = {
	email: string;
	name?: string | null;
};

type ResetPasswordEmailInput = {
	user: AuthEmailUser;
	url: string;
};

const defaultFromEmail = "Buni <onboarding@resend.dev>";
const defaultAppUrl = "http://localhost:5173";

const escapeHtml = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

export type EmailConfig = {
	appUrl: string;
	resendApiKey: string | null;
	fromEmail: string | null;
};

const getResendClient = (config: EmailConfig) => {
	const apiKey = config.resendApiKey?.trim();

	if (!apiKey) {
		throw new Error("RESEND_API_KEY is required for auth email flows.");
	}

	return new Resend(apiKey);
};

const getFromEmail = (config: EmailConfig) =>
	config.fromEmail?.trim() || defaultFromEmail;

const toGreetingName = (user: AuthEmailUser) => user.name?.trim() || user.email;

const buildEmailShell = (input: {
	preheader: string;
	eyebrow: string;
	title: string;
	intro: string;
	actionLabel: string;
	actionUrl: string;
	note: string;
	fallbackLabel: string;
	fallbackUrl: string;
}) => {
	const preheader = escapeHtml(input.preheader);
	const eyebrow = escapeHtml(input.eyebrow);
	const title = escapeHtml(input.title);
	const intro = escapeHtml(input.intro);
	const actionLabel = escapeHtml(input.actionLabel);
	const actionUrl = escapeHtml(input.actionUrl);
	const note = escapeHtml(input.note);
	const fallbackLabel = escapeHtml(input.fallbackLabel);
	const fallbackUrl = escapeHtml(input.fallbackUrl);

	return `
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3efe6;color:#1e2a24;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:rgba(255,255,255,0.92);border:1px solid rgba(30,42,36,0.08);border-radius:28px;padding:32px;box-shadow:0 24px 80px rgba(45,56,45,0.08);">
            <tr>
              <td>
                <div style="font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#6f7d73;">${eyebrow}</div>
                <h1 style="margin:18px 0 12px;font-size:32px;line-height:1.05;letter-spacing:-0.04em;color:#18211c;">${title}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#55635a;">${intro}</p>

                <a href="${actionUrl}" style="display:inline-block;border-radius:999px;background:#18211c;color:#f7f4ed;text-decoration:none;padding:14px 22px;font-size:14px;font-weight:600;">
                  ${actionLabel}
                </a>

                <div style="margin-top:24px;padding:16px;border-radius:18px;background:#f7f4ed;border:1px solid rgba(30,42,36,0.08);">
                  <div style="font-size:12px;font-weight:600;color:#38453d;margin-bottom:8px;">备用链接</div>
                  <div style="font-size:12px;line-height:1.7;word-break:break-all;color:#6b786f;">
                    <a href="${fallbackUrl}" style="color:#1f5d50;text-decoration:underline;">${fallbackLabel}</a>
                  </div>
                </div>

                <p style="margin:24px 0 0;font-size:12px;line-height:1.8;color:#7a877e;">${note}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
};

const buildResetPasswordEmail = (
	{ user, url }: ResetPasswordEmailInput,
	config: EmailConfig
) => {
	const greetingName = toGreetingName(user);
	const appUrl = config.appUrl || defaultAppUrl;

	return {
		subject: "重置你的 Buni 密码",
		text: [
			`${greetingName}，你好：`,
			"",
			"我们收到了你的密码重置请求。",
			`重置链接：${url}`,
			"",
			"如果这不是你本人发起的操作，请忽略这封邮件，并检查账号安全。",
			`Buni：${appUrl}`,
		].join("\n"),
		html: buildEmailShell({
			preheader: "打开链接，设置新的 Buni 登录密码。",
			eyebrow: "Buni",
			title: "重置你的密码",
			intro: `${greetingName}，你好。点击下面的链接后，你可以为 Buni 设置一个新的登录密码。`,
			actionLabel: "重置密码",
			actionUrl: url,
			note: "如果这不是你本人发起的操作，请忽略这封邮件，并检查你的账号安全。",
			fallbackLabel: url,
			fallbackUrl: url,
		}),
	};
};

const sendEmail = async (
	input: {
		to: string;
		subject: string;
		html: string;
		text: string;
	},
	config: EmailConfig
) => {
	const resend = getResendClient(config);

	const result = await resend.emails.send({
		from: getFromEmail(config),
		to: input.to,
		subject: input.subject,
		html: input.html,
		text: input.text,
	});

	if (result.error) {
		throw new Error(`Failed to send auth email: ${result.error.message}`);
	}

	return result.data;
};

const sendResetPasswordEmail = async (
	input: ResetPasswordEmailInput,
	config: EmailConfig
) => {
	const message = buildResetPasswordEmail(input, config);
	await sendEmail(
		{
			to: input.user.email,
			subject: message.subject,
			html: message.html,
			text: message.text,
		},
		config
	);
};

export { sendResetPasswordEmail };
