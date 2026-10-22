import {
  decisionEvaluationFixtures,
  replayDecisionEvaluationFixtures,
} from "@neobuni/core";

import { Effect, tryPromise } from "../effect";
import { getConfiguredJevProvider } from "./jev-provider-config";

const writeReport = (report: unknown) =>
  Effect.sync(() => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  });

const replayEvaluation = Effect.fnUntraced(function* (input: {
  profileId: string;
  includeDraft: boolean;
}) {
  const provider = yield* tryPromise("getConfiguredJevProvider", () =>
    getConfiguredJevProvider(input.profileId)
  );
  if (!provider) {
    yield* Effect.logError(
      "[buni/decision-evaluation] enabled OpenRouter Jev configuration is required in Settings; no request was sent."
    );
    process.exitCode = 1;
    return;
  }
  const report = yield* tryPromise("replayDecisionEvaluationFixtures", () =>
    replayDecisionEvaluationFixtures({
      fixtures: decisionEvaluationFixtures,
      provider,
      includedReviewStatuses: input.includeDraft
        ? ["reviewed", "draft"]
        : ["reviewed"],
    })
  );
  yield* writeReport(report);
  if (report.reviewedItemCount === 0) {
    yield* Effect.logError(
      "[buni/decision-evaluation] no reviewed fixtures were replayed; this output cannot satisfy a release gate."
    );
    process.exitCode = 2;
  }
});

const main = Effect.fnUntraced(function* () {
  const includeDraft = process.argv.includes("--include-draft");
  const profileFlagIndex = process.argv.indexOf("--profile-id");
  const profileId =
    profileFlagIndex >= 0 ? process.argv[profileFlagIndex + 1] : undefined;

  if (!profileId) {
    yield* Effect.logError(
      "[buni/decision-evaluation] --profile-id is required to read the Jev configuration saved in Settings; no request was sent."
    );
    process.exitCode = 1;
    return;
  }

  yield* replayEvaluation({ profileId, includeDraft });
});

if (import.meta.main) {
  await Effect.runPromise(main());
}
