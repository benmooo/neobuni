import { describe, expect, test } from "vitest";

import {
  resolvePostSignUpRedirect,
  resolveSignInFailureToast,
  resolveVerifyEmailRedirect,
} from "./auth-flow";

describe("auth flow redirects", () => {
  test("sends authenticated sign-ups into chat", () => {
    expect(resolvePostSignUpRedirect({ hasSession: true })).toEqual({
      to: "/chat",
    });
  });

  test("sends unauthenticated sign-ups to sign-in with a registration notice", () => {
    expect(resolvePostSignUpRedirect({ hasSession: false })).toEqual({
      to: "/auth/sign-in",
      search: {
        registered: "1",
      },
    });
  });

  test("redirects legacy verify-email routes back to sign-in", () => {
    expect(resolveVerifyEmailRedirect()).toEqual({
      to: "/auth/sign-in",
    });
  });

  test("surfaces sign-in failures as a stable toast payload", () => {
    expect(
      resolveSignInFailureToast({
        message: "Invalid email or password",
      })
    ).toEqual({
      id: "auth-sign-in-error",
      message: "Invalid email or password",
    });
  });
});
