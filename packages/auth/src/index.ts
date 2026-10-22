import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@neobuni/db";
import {
  ensurePersonalProfileForUser,
  getPreferredProfileIdForUser,
  setSessionActiveProfile,
} from "@neobuni/db";
import { betterAuth } from "better-auth";
import { Effect } from "effect";

import { sendResetPasswordEmail, type EmailConfig } from "./email";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
  APP_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

const buildEmailConfig = (env: AuthConfig): EmailConfig => ({
  appUrl: env.APP_URL ?? env.CORS_ORIGIN,
  resendApiKey: env.RESEND_API_KEY ?? null,
  fromEmail: env.RESEND_FROM_EMAIL ?? null,
});

const run = Effect.runPromise;

const buildSessionCreatePayload = async (session: {
  userId: string;
  [key: string]: unknown;
}) => ({
  ...session,
  activeProfileId: await run(getPreferredProfileIdForUser(session.userId)),
});

const handleUserCreated = async (input: { userId: string; name: string }) => {
  await run(ensurePersonalProfileForUser(input.userId, input.name));
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = []
) {
  const emailConfig = buildEmailConfig(env);
  const trustedOrigins = [
    env.CORS_ORIGIN,
    env.APP_URL,
    env.BETTER_AUTH_URL,
    "http://localhost:3000",
    "http://localhost:3001",
    ...desktopOrigins,
  ].filter((origin): origin is string => Boolean(origin));

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "sqlite",
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await sendResetPasswordEmail(
          {
            user: { email: user.email, name: user.name },
            url,
          },
          emailConfig
        );
      },
    },
    session: {
      additionalFields: {
        activeProfileId: {
          type: "string",
          required: false,
          returned: true,
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await handleUserCreated({ userId: user.id, name: user.name });
          },
        },
      },
      session: {
        create: {
          before: async (session) => ({
            data: await buildSessionCreatePayload(session),
          }),
        },
      },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];

export { setSessionActiveProfile };
export type { EmailConfig };
export { sendResetPasswordEmail };
