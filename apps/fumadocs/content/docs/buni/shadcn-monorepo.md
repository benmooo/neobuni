---
title: "shadcn/ui Monorepo Guide"
---

# shadcn/ui Monorepo Guide

This repository uses shadcn in a monorepo layout:

- `apps/mobile` is the app workspace.
- `packages/ui` is the shared UI package.

Current local baseline:

- shared primitives are intentionally trimmed to the set used by `apps/mobile`
- icons use Phosphor
- interactive primitives should prefer Base UI over Radix

## Responsibilities

Use `apps/mobile` for:

- routes
- screens
- page-level or feature-level components
- app-local composition

Use `packages/ui` for:

- reusable primitives such as `button`, `input`, `dialog`, `sheet`
- shared hooks
- shared utilities
- shared theme styles and tokens

Rule of thumb:

- if a component is business-specific, keep it in `apps/mobile`
- if a component can be reused by another app later, keep it in `packages/ui`

## Why It Works

The app and the shared UI package each have a `components.json` file.

`apps/mobile/components.json` tells the CLI:

- where the app-local aliases live
- that shared styles come from `../../packages/ui/src/styles/globals.css`
- that shared UI components are imported from `@buni/ui/components`

`packages/ui/components.json` tells the CLI:

- where shared components should be written
- where shared hooks and utilities live

Both files must stay aligned on:

- `style`
- `iconLibrary`
- `tailwind.baseColor`

## Normal Workflow

Add shared shadcn components from the app workspace:

```bash
cd apps/mobile
bunx --bun shadcn@latest add button
```

Add app-specific blocks from the app workspace too:

```bash
cd apps/mobile
bunx --bun shadcn@latest add login-01
```

The CLI decides what belongs in `packages/ui` and what belongs in `apps/mobile`.

## Do Not Do This

Do not run this inside an existing workspace:

```bash
cd packages/ui
bunx --bun shadcn@latest init --monorepo
```

Do not run this inside `apps/mobile` to "recreate" `packages/ui`:

```bash
cd apps/mobile
bunx --bun shadcn@latest init --monorepo
```

`--monorepo` is for scaffolding a new monorepo project shape, not for rebuilding one workspace inside an already existing monorepo.

## Preset Changes

If you want to switch to another preset for the existing setup, use:

```bash
cd apps/mobile
bunx --bun shadcn@latest apply --preset b0
```

This is the preferred way to update theme, colors, CSS variables, fonts, and icons in an existing project.

## Re-initializing Safely

If the current shadcn setup is broken and needs a reset:

1. Make sure `apps/mobile/components.json` and `packages/ui/components.json` are committed or backed up.
2. Remove only the shadcn-managed files you actually want to replace.
3. Re-run `apply --preset ...` first.
4. Only use `init --force` if `apply` is not enough.

Before using any forceful reset, check these files carefully:

- `apps/mobile/components.json`
- `packages/ui/components.json`
- `packages/ui/src/styles/globals.css`
- `packages/ui/src/lib/utils.ts`
- `packages/ui/src/components/*`

## Local Conventions

- Run shadcn commands from `apps/mobile`.
- Import shared primitives from `@buni/ui/components/...`.
- Keep app-only wrappers and feature composition inside `apps/mobile/src`.
- Treat `packages/ui` as shared source code, not a generated artifact that can be casually blown away.
- When rebuilding a primitive, prefer Base UI or plain semantic HTML before introducing another headless dependency.
- Keep `apps/mobile/components.json` and `packages/ui/components.json` aligned on `iconLibrary`. This repo currently uses `phosphor`.
- The current shared primitive set is: `alert`, `badge`, `button`, `card`, `field`, `input`, `native-select`, `scroll-area`, `separator`, `switch`, and `textarea`.
