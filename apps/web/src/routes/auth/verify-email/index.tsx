import { createFileRoute, redirect } from "@tanstack/react-router";

import { resolveVerifyEmailRedirect } from "@/lib/auth-flow";

export const Route = createFileRoute("/auth/verify-email/")({
  beforeLoad: () => {
    throw redirect({
      ...resolveVerifyEmailRedirect(),
      replace: true,
    });
  },
  component: VerifyEmailRedirectPage,
});

function VerifyEmailRedirectPage() {
  return null;
}
