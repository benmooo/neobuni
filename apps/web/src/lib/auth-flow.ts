const defaultAppUrl = "http://localhost:5173";
const signInFailureToastId = "auth-sign-in-error";

const getAppUrl = () => {
	const configured = import.meta.env.VITE_APP_URL;

	if (typeof configured === "string" && configured.length > 0) {
		return configured;
	}

	if (typeof window !== "undefined" && window.location.origin.length > 0) {
		return window.location.origin;
	}

	return defaultAppUrl;
};

const buildAuthCallbackUrl = (path: string) =>
	new URL(path, getAppUrl()).toString();

const resolvePostSignUpRedirect = (input: { hasSession: boolean }) =>
	input.hasSession
		? { to: "/chat" as const }
		: {
				to: "/auth/sign-in" as const,
				search: {
					registered: "1" as const,
				},
			};

const resolveVerifyEmailRedirect = () => ({
	to: "/auth/sign-in" as const,
});

const getAuthErrorMessage = (error: unknown, fallback: string) => {
	if (
		error &&
		typeof error === "object" &&
		"message" in error &&
		typeof error.message === "string"
	) {
		return error.message;
	}

	return fallback;
};

const resolveSignInFailureToast = (error: unknown) => ({
	id: signInFailureToastId,
	message: getAuthErrorMessage(error, "登录失败，请检查邮箱和密码。"),
});

export {
	buildAuthCallbackUrl,
	getAuthErrorMessage,
	resolvePostSignUpRedirect,
	resolveSignInFailureToast,
	resolveVerifyEmailRedirect,
};
