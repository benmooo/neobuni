import { createFileRoute, redirect } from "@tanstack/react-router";

import { resolveVerifyEmailRedirect } from "@/lib/auth-flow";

export const Route = createFileRoute("/auth/verify-email/callback")({
  beforeLoad: () => {
    throw redirect({
      ...resolveVerifyEmailRedirect(),
      replace: true,
    });
  },
  component: VerifyEmailCallbackRedirectPage,
});

function VerifyEmailCallbackRedirectPage() {
  return null;
}
