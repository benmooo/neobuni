---
title: "Decision evaluation programme"
---

# Decision evaluation programme

> Status: operating procedure for Milestone 6. This document defines evidence for a Jev release gate; it does not grant a provider any authority.

## Purpose

An evaluation answer is useful only when Buni can identify the question version, the reviewed expected answer, the provider output, and the owner who accepted the trade-off. The programme therefore separates three datasets:

| Dataset          | Source                                       | Permitted use                       |
| ---------------- | -------------------------------------------- | ----------------------------------- |
| Seed fixture     | Engineering-authored scenario                | Coverage and draft observation only |
| Reviewed fixture | Independently reviewed expected result       | Offline release-gate input          |
| Online trace     | Production shadow decision and user feedback | Monitoring and rollback evidence    |

No seed fixture becomes reviewed merely because Jev agrees with it. A provider replay on draft data is diagnostic only.

## Review protocol

For each fixture, two people perform these roles before `reviewStatus` may change to `reviewed`:

1. The **scenario author** records a bounded state projection and why the family is relevant.
2. The **label reviewer** independently chooses the expected typed value and checks that injection-shaped text remains data, not instructions.
3. The **family DRI** resolves disagreements, records the criteria version, and accepts the fixture into the reviewed set.

The review record must include reviewer identity, review timestamp, question family/version, expected value, rationale, language, and whether the fixture may contribute to a release gate. Store it with the fixture change or in the team’s review system; do not put raw private conversation data in the record.

## Replay procedure

Run the reviewed set only:

```sh
bun run --cwd apps/server decision:evaluate -- --profile-id <profile-id>
```

The command reads the enabled OpenRouter Jev configuration for a profile from Settings, sends the minimized fixture projections to the OpenRouter Decisions endpoint, and prints JSON with each typed answer, provider version, latency, and match result. It does not print the API key.

For exploratory comparison, include drafts explicitly:

```sh
bun run --cwd apps/server decision:evaluate -- --profile-id <profile-id> --include-draft
```

The report maintains separate `reviewedMatchRate` and `draftMatchRate`. A report with `reviewedItemCount: 0` exits non-zero and cannot be cited as release evidence.

## Per-family gate

Before a family changes behavior, its DRI verifies all of the following:

- reviewed coverage includes positive, negative, ambiguous, stale/conflicting, injection-shaped, Chinese, English, mixed-language, and choice-order cases where relevant;
- the replay report covers the current exact question ID and criteria semantics;
- thresholds are set independently for the family’s risk tier and language mix;
- production shadow traces meet the configured latency, provider-error-rate, agreement, and fallback expectations;
- a user-feedback metric exists for user-visible suggestions;
- the owner has tested the rollback flag and confirmed the deterministic fallback;
- execution candidates additionally have a policy test, scoped authorization, idempotency design, receipt/reconciliation design, and cancellation path.

The retrieval family’s current runtime gate remains deliberately narrower: it can only suppress a deterministic prefetch. Passing it does not validate any other family, suggestion, authorization, or external effect.

## Reporting and retention

Attach the JSON replay report to the family’s release decision. Compare reports by `familyId`, provider version, and fixture revision; do not aggregate different question semantics under one metric. Retain an immutable copy of the reviewed fixture revision and report, then use production traces only as follow-up evidence. A provider/model upgrade starts a fresh replay and sign-off.

## Current status

The repository contains five initial fixtures across the retrieval and next-action families. The Buni product DRI reviewed the proposed labels on 2026-10-22; every reviewed fixture carries reviewer identity, timestamp, and rationale in the Zod-validated contract. The first live replay ran on 2026-10-22 through OpenRouter and returned four matches from five reviewed fixtures (80%). Its graph-memory ambiguous/stale case mismatched the reviewed label, so it is calibration evidence only; see [`evaluation-reports/2026-10-22-openrouter-jev-1.14-replay.md`](./evaluation-reports/2026-10-22-openrouter-jev-1.14-replay.md). Jev remains shadow-only except for the existing guarded retrieval-suppression mechanism, which still requires its own runtime release gate.

The DRI reviewed three graph-memory v2 fixtures on 2026-10-22. Their first reviewed replay matched all three v2 labels, but the eight-fixture report was 75% overall: graph v1 and initiative v1 each mismatched once. Versions remain separate and routing stays disabled; see [`evaluation-reports/2026-10-22-openrouter-jev-1.14-reviewed-v2-replay.md`](./evaluation-reports/2026-10-22-openrouter-jev-1.14-reviewed-v2-replay.md).

The Buni product DRI reviewed the four `retrieval.evidence_relevance.v1` fixtures on 2026-10-22. They cover direct but low-ranked evidence, irrelevant but high-ranked evidence, stale graph evidence, ambiguity, and injection-shaped content across Chinese, English, and mixed-language requests. Score fixtures carry an explicit tolerance because score equality is not a meaningful calibration criterion. The reviewed labels may now supply offline replay evidence; the shadow switch remains off by default, and no reranking consumer is enabled.
