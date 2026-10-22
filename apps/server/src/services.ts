import "varlock/auto-load";

import { createAuth } from "@neobuni/auth";
import { configureDatabase } from "@neobuni/db";

import { ENV } from "./env.server";

export const db = configureDatabase({ url: ENV.DATABASE_URL });

export const auth = createAuth(
  {
    APP_URL: ENV.NEOBUNI_APP_URL,
    BETTER_AUTH_SECRET: ENV.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: ENV.BETTER_AUTH_URL,
    CORS_ORIGIN: ENV.CORS_ORIGIN,
    RESEND_API_KEY: ENV.RESEND_API_KEY ?? undefined,
    RESEND_FROM_EMAIL: ENV.RESEND_FROM_EMAIL ?? undefined,
  },
  db
);
