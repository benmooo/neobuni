import type { ServerRouterClient } from "@neobuni/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import { ENV } from "@/env";

export const apiBaseUrl = ENV.VITE_SERVER_URL;

const link = new RPCLink({
	url: `${apiBaseUrl}/rpc`,
	fetch: (input, init) =>
		fetch(input, {
			...init,
			credentials: "include",
		}),
});

export const api = createORPCClient<ServerRouterClient>(link);

export const apiFetch = (path: string, init?: RequestInit) =>
	fetch(`${apiBaseUrl}${path}`, {
		...init,
		credentials: "include",
	});
