import { createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/auth/")({
	beforeLoad: async () => {
		const session = await authClient.getSession();

		if (session.data) {
			throw redirect({ to: "/chat", replace: true });
		}

		throw redirect({ to: "/auth/sign-in", replace: true });
	},
});
