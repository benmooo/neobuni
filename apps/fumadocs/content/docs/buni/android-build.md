---
title: "Android APK Build"
---

# Android APK Build

## Goal

This repo does **not** commit the generated Android native project under `apps/mobile/src-tauri/gen/android`.

Instead, Android packaging is treated as a reproducible bootstrap step:

1. verify the Android toolchain
2. generate the Android project if it is missing
3. build the APK through Tauri

The generated directory remains ignored by Git.

## Prerequisites

Required local tools:

- `bun`
- `cargo`
- `rustup`
- `java`

Required environment variables:

- `JAVA_HOME`
- `ANDROID_HOME`
- `NDK_HOME`

Required Android SDK content under `ANDROID_HOME`:

- `platform-tools`
- `build-tools`
- `platforms`

Required Rust target:

- `aarch64-linux-android`

Install it with:

```sh
rustup target add aarch64-linux-android
```

## Commands

Run the Android environment check:

```sh
bun run android:doctor
```

Generate the Android project when `apps/mobile/src-tauri/gen/android` is missing:

```sh
bun run android:init
```

Run the app on Android in dev mode:

```sh
bun run android:dev
```

Build a debug APK:

```sh
bun run apk:android:debug
```

Build a release APK without signing setup:

```sh
bun run apk:android:release
```

The same entrypoints are also available through `just`:

```sh
just clean-mobile-status
just clean-mobile-rust
just clean-mobile-android
just clean-mobile-build
just android-doctor
just android-init
just android-dev
just android-apk-debug
just android-apk-release
```

## Bootstrap Behavior

`android:init` and all higher-level Android commands call the bootstrap script:

- `apps/mobile/scripts/check-android-env.sh`
- `apps/mobile/scripts/bootstrap-android.sh`

Bootstrap behavior:

1. fail fast if Java / Android SDK / NDK / Rust target are missing
2. skip generation if `src-tauri/gen/android` already exists
3. run `bun run tauri android init --ci` only when the generated project is absent

If you want to force regeneration:

```sh
rm -rf apps/mobile/src-tauri/gen/android
bun run android:init
```

## Output Notes

Tauri and Gradle print the final artifact path during the build.

Generated Android artifacts live under:

```text
apps/mobile/src-tauri/gen/android/app/build/outputs/
```

Because `src-tauri/gen/` is ignored, these artifacts are local build outputs only.

## Cleanup

The mobile app can accumulate several gigabytes of local build output, especially in:

- `apps/mobile/src-tauri/target`
- `apps/mobile/src-tauri/gen/android`
- `apps/mobile/dist`

Inspect current artifact sizes:

```sh
bun run clean:mobile:status
```

Remove only Rust/Tauri compile output:

```sh
bun run clean:mobile:rust
```

Remove only the generated Android project and Gradle/APK output:

```sh
bun run clean:mobile:android
```

Remove all mobile build artifacts together:

```sh
bun run clean:mobile:build
```

These cleanup commands do **not** remove `node_modules`, Bun dependencies, or repository source files.
