---
title: "Feishu DB-Backed Config"
---

# Feishu DB-Backed Config

## Goal

Replace the current env-only Feishu integration with a profile-scoped database config model while keeping env fallback for existing setups.

This document now covers the database-backed Feishu transport config plus the current composable delivery surface.

It does not address provider `reasoning_content` compatibility issues.

## Problems In The Current Design

The current implementation reads:

- `BUNI_FEISHU_APP_ID`
- `BUNI_FEISHU_APP_SECRET`
- `BUNI_FEISHU_BASE_URL`
- `BUNI_FEISHU_TARGETS_JSON`

directly from process env.

That creates three practical issues:

1. Feishu configuration cannot be managed from the app.
2. All profiles share one global Feishu setup.
3. `list_feishu_targets` fails when app credentials are missing even though target discovery should not depend on send credentials.

## Design

Introduce two new database-backed concepts:

1. Feishu integration config
2. Feishu delivery targets

### 1. Feishu Integration Config

One config per profile.

Fields:

- `id`
- `profileId`
- `appId`
- `appSecret`
- `baseUrl`
- `enabled`
- `createdAt`
- `updatedAt`

### 2. Feishu Targets

Multiple targets per profile.

Fields:

- `id`
- `profileId`
- `alias`
- `label`
- `receiveIdType`
- `receiveId`
- `enabled`
- `createdAt`
- `updatedAt`

Targets are stored as rows, not as a JSON blob, so they can be edited independently.

## Read Precedence

Feishu config resolution becomes:

1. profile-scoped database config
2. env fallback

This keeps old env-based setups working while allowing in-app configuration.

## Behavioral Changes

### Target listing is decoupled from app credentials

`list_feishu_targets` should read configured targets without requiring `appId` and `appSecret`.

This means:

- preview flows can still resolve aliases
- target discovery works before the transport credentials are configured

### Delivery still requires transport credentials

`send_feishu_message` still requires:

- enabled integration config
- valid `appId`
- valid `appSecret`

Reflection reports are now delivered through composition:

1. `create_reflection_report` or `get_reflection_report`
2. `render_reflection_report_to_feishu_message`
3. `send_feishu_message`

### Cache key becomes config-aware

The tenant access token cache must no longer be a single global token.

It should be keyed by the effective Feishu transport identity:

- `profileId`
- `appId`
- `baseUrl`

This avoids cross-profile token reuse.

## API Shape

Add a profile-scoped config endpoint:

- `GET /v1/config/feishu`
- `PUT /v1/config/feishu`

The write payload should contain both:

- transport config
- target list

The server write path should replace the profile's target rows with the submitted target set.

## UI Shape

Add a Feishu section under Settings with fields for:

- enabled
- app id
- app secret
- base URL
- targets list

Each target row should allow:

- alias
- label
- receive id type
- receive id
- enabled

## Security

First pass stores Feishu secrets in the database, matching the current provider-config pattern.

This is acceptable for the current early-stage project phase.

A later hardening pass can introduce encryption at rest using a master key.

## Migration Strategy

No destructive migration is needed.

Implementation should:

1. add the new tables
2. read DB config first
3. fall back to env if DB config is absent

Existing env setups continue to function without manual migration.

## Current Delivery Surface

`send_feishu_message` accepts a typed `message` payload:

- `{ type: "text", text }`
- `{ type: "card", card, fallbackText }`

This keeps the transport generic while letting higher-level tools render richer Feishu cards without introducing another composite send helper.

## Non-Goals

- no delivery-log schema redesign
- no token encryption pass in this turn
- no upstream provider compatibility work
