import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { apiBaseUrl } from "./api";

const authClient = createAuthClient({
	baseURL: `${apiBaseUrl}/api/auth`,
	plugins: [
		inferAdditionalFields({
			session: {
				activeProfileId: {
					type: "string",
					required: false,
				},
			},
		}),
	],
});

export { authClient };
