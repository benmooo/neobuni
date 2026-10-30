---
title: "Feature: tmux-agent-notifications"
---

# Feature: tmux-agent-notifications

Updated At: 2026-10-27 16:25 Asia/Shanghai
Status: active (design review)

## Goal

Make tmux tell me when an agent running in another pane or window needs a human
decision, finishes a job, or dies, without me polling panes.

The system should answer three questions at a glance:

1. Which pane needs me right now? (persistent marker)
2. What just happened? (desktop notification + action sound)
3. Where do I click to get there? (click focuses the exact tmux pane)

Scope: OpenCode, Claude Code, and any process launched through a small wrapper.
macOS + Ghostty + tmux only.

## Non-Goal

- No remote/mobile push, email, or Slack.
- No auto-approval of permissions, no changes to agent decision-making.
- No log scraping or terminal-content parsing. Notifications are driven by
  explicit agent events.
- No persistent notification queue or "inbox" UI. The tmux status marker is the
  queue.
- No tmux `allow-passthrough` dependency. Escapes from panes must not be able to
  reach the outer terminal.

## Why Now

- Multiple coding agents now run concurrently in tmux (`neobuni:1.1`,
  `neobuni:1.2`, `buni:4.1` at the time of writing).
- The current tmux config explicitly disables every built-in attention signal:
  `bell-action none`, `visual-activity off`, `monitor-activity off`.
- `focus-events` is off, so TUIs inside tmux cannot tell whether they are
  focused; OpenCode's built-in attention notifications will either never fire or
  fire while I am looking at the pane.
- `allow-passthrough` is off, so OSC 9/777 desktop notifications emitted by a
  TUI are dropped by tmux.
- OpenCode's own notification cannot identify the originating tmux pane, cannot
  jump to it on click, and says nothing about Claude Code or plain processes.

## Current State (verified on this machine)

| Fact | Value | Consequence |
|---|---|---|
| tmux | 3.7b | `set-hook`, `pane-died`, `#{@user_option}` available |
| Ghostty | 1.3.1 | supports OSC 9/777 desktop notifications |
| `focus-events` | `off` | app-level focus detection is broken under tmux |
| `allow-passthrough` | `off` | TUI OSC notifications never reach Ghostty |
| `bell-action` | `none` | tmux never rings |
| `monitor-activity` | `off` | no activity alerts |
| `pane-border-status` | `top` | free per-pane status surface already exists |
| `status-interval` | `5` | status redraw within 5s without extra refresh |
| `remain-on-exit` | `failed` | `pane-died` hook fires on nonzero exits |
| `terminal-notifier` | not installed | `osascript` fallback required until installed |
| OpenCode | 2.1.4 | V2 TUI plugin API exposes typed events + `attention.notify` |
| OpenCode attention | config exists | OSC-based; unusable behind tmux without passthrough |
| Claude Code | installed | `Notification` / `Stop` / `StopFailure` hooks available |

## Build vs. Borrow: `accessd/tmux-agent-indicator`

Evaluated at commit `553c3cc` (2026-08-14, MIT, ~99 stars). It is the closest
existing project: pane border/window title/status icon states for
`running` / `needs-input` / `done`, Claude + Codex + OpenCode adapters,
focus-based reset, and a custom notification command hook.

It is not a good base for this setup.

| Need | `tmux-agent-indicator` | This spec |
|---|---|---|
| OpenCode 2.1.4 | V1 plugin API (`export const ... = async ({ $ })`), V1 event payloads (`event.properties.status`, `permission.updated`, `session.error`); V1 implementations do not run in V2 | V2 TUI plugin with verified events (`permission.asked`, `session.execution.*`) |
| Correct pane with multiple agents | server-side plugin resolves `$TMUX_PANE` from the server process or scans global state; can mark the wrong pane | TUI plugin runs in the pane process; exact `$TMUX_PANE` |
| Error state | `session.error` is mapped to `done` | distinct `error` state |
| Desktop notification | `display-message` by default; custom command has no pane id | terminal-notifier + click-to-focus + sound + reminder |
| Dedupe / rate limit | per-state only | per request key + cooldowns + one reminder |
| Existing config | installer rewrites Claude/Codex/OpenCode config and wraps the Claude status line | only adds a sourced tmux file and new hook entries |
| Visual ownership | owns `window-status-style` and `pane-active-border-style` | owns only marker formats and `@pane_agent_*` options |
| macOS bash | `session-dots.sh` uses associative arrays; system bash is 3.2 | POSIX-compatible shell helper |

Decision: do not adopt it as a dependency or run it in parallel. Borrow two
things:

1. Its reset-on-focus semantics (already reflected in the state model).
2. Its Codex hook mapping (`UserPromptSubmit` → running, `PermissionRequest` →
   needs-input, `Stop` → done) if Codex becomes a target.

Its visual palette/animation and account-limit segment are separate concerns;
revisit them later as UI-only add-ons, not as the notification backbone.

## State Model

One state per pane. Stored as tmux pane user options, so it survives agent
restarts and is readable by any script:

| State | Meaning | Marker | Sticky? |
|---|---|---|---|
| `working` | agent is executing; no human action possible | `◐` amber | no |
| `blocked` | needs permission or an answer; execution cannot proceed | `●` red | yes, until reply or new run |
| `done` | turn/job finished successfully | `✔` green | yes, until pane focused or new run |
| `error` | execution failed, or the agent process exited nonzero | `✖` red | yes, until new run |
| `idle` | no active work and nothing to report | none | n/a |

Precedence used to build the window-level rollup:
`blocked > error > done > working > idle`.

Pane options written by the helper:

```text
@pane_agent_state     working | blocked | done | error | idle
@pane_agent_glyph     ◐ | ● | ✔ | ✖ | (empty)
@pane_agent_style     #[fg=colour221] | #[fg=colour203,bold] | ...
@pane_agent_source    opencode | claude | process | manual
@pane_agent_message   short, single-line summary
@pane_agent_since     unix epoch seconds
@pane_agent_key       dedupe key (permission id, form id, ...)
```

Window rollup options:

```text
@agent_state   worst state among the window's panes
@agent_glyph   matching glyph, or empty
@agent_style   matching style, or empty
```

## Notification Spec

### When to notify

| Transition | Desktop toast | Sound | tmux flash |
|---|---|---|---|
| `working → blocked` (permission / form / question) | yes, once per request key | yes | yes |
| `working → done` | only if the pane is not focused; 10s cooldown per pane | no | no |
| `working → error` | yes, once per failure | yes | yes |
| `working → idle` (interrupted / shutdown) | no | no | no |
| `blocked → working` (user replied) | no | no | no |
| `working → retry` (rate limit / provider retry) | no immediate toast; marker only | no | no |
| retry still active after 60s | yes, if pane not focused | no | no |
| pane process exits nonzero (`pane-died`) | yes, if pane not focused | no | yes |
| subagent / child session completes | no | no | no |
| repeated event for the same key | no | no | no |
| blocked still unresolved after 5 min | one reminder toast, then stop | optional, on by default | no |

Definitions:

- **Focused** means all of: the pane is the active pane, its window is the
  active window, its session has an attached client, and the frontmost macOS
  application is a terminal (Ghostty by default). This avoids suppressing a
  notification when I am in another app while tmux still considers the pane
  active.
- **Job done** means a root-session turn finished with success, not every model
  step and not a subagent.
- **Blocked** outranks every other state and is never auto-cleared by focus.
- `done` is cleared when the pane gains focus, because seeing the pane is the
  acknowledgement.
- Errors and blocked states are cleared only by a new run or an explicit
  `agent-notify --state idle`.

### How to notify

Three independent layers, each useful on its own:

1. **Persistent marker (always on).** Window list + pane border show the glyph
   and color. This is the source of truth. No toast can be missed permanently.
2. **Desktop notification (attention layer).** `terminal-notifier` when
   installed; `osascript display notification` fallback. Clicking a
   terminal-notifier notification runs `agent-focus`, which activates Ghostty
   and switches the client to the exact pane. OSC passthrough is not used.
3. **In-tmux flash (optional, default on for blocked/error).**
   `tmux display-message -d 4000` on attached clients, e.g.
   `● buni:4.1 needs permission`. This catches the case where I am in another
   tmux window and notifications are muted.

Message format:

```text
title:   ● buni:4.1 · neobuni
message: Permission: bash — rm -rf node_modules
```

`title` = glyph + `session:window.pane` + window name.
`message` = short reason, truncated to 140 chars, control characters stripped.
Command text is included only when `--detail` is passed; default is the action
type so lock-screen previews do not leak full commands.

Sounds (on by default, `afplay`):

| State | File |
|---|---|
| blocked | `/System/Library/Sounds/Glass.aiff` |
| error | `/System/Library/Sounds/Basso.aiff` |
| done | none |

### Dedupe and rate limiting

- One notification per `(pane, state, key)`. The key is the permission request
  id, form id, session id + execution id, or pane id for process exits.
- `done` has a 10s per-pane cooldown.
- `blocked` and `error` have a 3s per-pane cooldown to absorb event bursts.
- Re-notifying the same blocked key is impossible; a new permission request is
  a new key and notifies again.
- On `blocked`, the helper schedules one detached `--remind-after 300` check.
  It re-reads the pane's current state and key before firing, so an answered
  request produces no reminder.
- No notification if the state did not change and the key matches the last
  notified key.

## Architecture

```text
OpenCode TUI plugin ─┐
Claude Code hooks  ──┼──> agent-notify (one entrypoint) ──> tmux pane/window options
generic wrapper    ──┤                                  ├──> terminal-notifier / osascript
tmux pane-died hook ─┘                                  └──> tmux display-message
                                                              │
                                                              └──> agent-focus on click
```

All integrations are event sources only. They never format notifications or
touch the UI directly; that keeps behavior identical across agents and makes the
policy testable in one place.

## Components

Proposed files (outside the repo except the OpenCode plugin, which can live in
the global OpenCode config):

```text
~/.config/tmux/agent-notify              # policy + state + notification entrypoint
~/.config/tmux/agent-focus               # click-to-focus helper
~/.config/tmux/agent-notifications.tmux  # status formats, hooks, options
~/.config/opencode/plugins/tmux-notify/
  package.json
  tui.ts                                 # OpenCode V2 TUI plugin
~/.claude/hooks/tmux-agent-notify.sh     # Claude Code hook adapter
```

### 1. `agent-notify` CLI

```text
agent-notify --state blocked|done|error|working|idle
             [--pane %id]            # default: $TMUX_PANE
             [--source opencode|claude|process|manual]
             [--title TEXT]          # optional override
             [--message TEXT]
             [--key TEXT]            # dedupe key
             [--notify auto|always|never]
             [--sound auto|always|never]
             [--flash auto|always|never]
             [--detail]              # allow command text in the message
```

Behavior:

1. Resolve the pane and its `session:window.pane` location. Outside tmux, exit 0
   (or notify without a marker when `--notify always`).
2. Validate/normalize state and message.
3. Write `@pane_agent_*` options, recompute the window rollup, and
   `tmux refresh-client -S`.
4. Apply the notification matrix, dedupe, cooldown, and focus check.
5. Send the OS notification and optional sound; log one NDJSON line.
6. On `idle`, clear the pane and rollup.

Log: `${XDG_STATE_HOME:-$HOME/.local/state}/tmux-agent-notify/events.ndjson`,
truncated at 1 MB. This is for tuning noise, not an audit trail.

### 2. tmux config additions

A separate file sourced from `~/.tmux.conf`, so the review diff stays small:

```tmux
# ~/.config/tmux/agent-notifications.tmux

# Needed for pane-focus-in and for TUIs to know if they are focused.
set -g focus-events on

# Add the state marker to the existing formats instead of replacing them.
setw -g window-status-format \
  " #[fg=brightblack]#I:#W#{?@agent_glyph, #{@agent_style}#{@agent_glyph},} "
setw -g window-status-current-format \
  " #[fg=black,bg=cyan,bold]#I:#W#{?@agent_glyph, #{@agent_style}#{@agent_glyph},} "
setw -g pane-border-format \
  " #{pane_index} #{pane_current_command}#{?@pane_agent_glyph, #{@pane_agent_style}#{@pane_agent_glyph},} "

# Clear the "done" acknowledgement when I look at the pane.
set-hook -g pane-focus-in \
  'run-shell -b "~/.config/tmux/agent-notify --pane #{hook_pane} --event focus"'

# Generic safety net for crashed agents (remain-on-exit failed is already on).
set-hook -g pane-died \
  'run-shell -b "~/.config/tmux/agent-notify --pane #{hook_pane} --state error --source process --message \"exited #{pane_dead_status}\" --key exit-#{pane_dead_time}"'
```

Notes:

- `@agent_style` contains only a foreground style. The glyph inherits the
  background of the current window entry, so no `#[default]` reset is needed.
- The window marker is a rollup; the pane border is the exact pane.
- `agent-notify --event focus` clears `done` only. It leaves `blocked` and
  `error` untouched.

### 3. OpenCode V2 TUI plugin

Why the TUI part, not the server part: the TUI runs in the pane process, so it
has `$TMUX_PANE` and can filter events to the sessions open in that TUI. A
server plugin is shared across all panes and cannot identify the origin.

Event mapping:

| OpenCode event | State | Key | Message |
|---|---|---|---|
| `session.execution.started` | `working` | sessionID + event id | session title |
| `permission.asked` | `blocked` | `data.id` | `data.action` (detail: resources) |
| `form.created` | `blocked` | `data.form.id` | form title / "needs input" |
| `permission.replied` | `working` | request id | resume |
| `form.replied` / `form.cancelled` | `working` | form id | resume |
| `session.execution.succeeded` | `done` | sessionID + event id | session title + duration |
| `session.execution.failed` | `error` | sessionID + event id | `data.error.message` |
| `session.execution.interrupted` | `idle` | — | — |
| `session.retry.scheduled` | `working` (marker only) | sessionID | "retry #n" |

Filtering rules:

- Ignore child/subagent sessions: `ctx.data.session.root(sessionID) !== sessionID`.
- Notify only for sessions open in this TUI: `ctx.ui.tabs.list()` when tabs are
  enabled, otherwise the current route from `ctx.ui.router.current()`.
- `active` on the tab tells us whether the session is visible in this TUI; it is
  an input to the focus decision, not a replacement for the pane check, because
  Ghostty may be in the background.

Sketch:

```ts
import { Plugin } from "@opencode/plugin/tui"
import { spawn } from "node:child_process"

const pane = process.env.TMUX_PANE
const notify = (args: string[]) => {
  if (!pane) return
  spawn("agent-notify", ["--pane", pane, ...args], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  }).unref()
}

export default Plugin.define({
  id: "tmux.notify",
  setup(ctx) {
    const mine = (sessionID: string) =>
      ctx.data.session.root(sessionID) === sessionID &&
      (ctx.ui.tabs.enabled()
        ? ctx.ui.tabs.list().some((tab) => tab.sessionID === sessionID)
        : ctx.ui.router.current()?.type === "session" &&
          ctx.ui.router.current().sessionID === sessionID)

    const stops = [
      ctx.data.on("session.execution.started", (e) => {
        if (mine(e.data.sessionID)) notify(["--state", "working", "--source", "opencode"])
      }),
      ctx.data.on("permission.asked", (e) => {
        if (!mine(e.data.sessionID)) return
        notify(["--state", "blocked", "--source", "opencode",
          "--key", e.data.id, "--message", `Permission: ${e.data.action}`])
      }),
      ctx.data.on("form.created", (e) => {
        if (!mine(e.data.form.sessionID)) return
        notify(["--state", "blocked", "--source", "opencode",
          "--key", e.data.form.id, "--message", "Needs input"])
      }),
      ctx.data.on("permission.replied", (e) => {
        if (mine(e.data.sessionID)) notify(["--state", "working", "--source", "opencode"])
      }),
      ctx.data.on("session.execution.succeeded", (e) => {
        if (mine(e.data.sessionID))
          notify(["--state", "done", "--source", "opencode",
            "--key", e.id, "--message", "Done"])
      }),
      ctx.data.on("session.execution.failed", (e) => {
        if (mine(e.data.sessionID))
          notify(["--state", "error", "--source", "opencode",
            "--key", e.id, "--message", e.data.error.message])
      }),
      ctx.data.on("session.execution.interrupted", (e) => {
        if (mine(e.data.sessionID)) notify(["--state", "idle", "--source", "opencode"])
      }),
    ]

    return () => stops.forEach((stop) => stop())
  },
})
```

Validation needed before implementation:

- `node:child_process` is available inside a V2 TUI plugin (the TUI is a Bun
  process). If it is sandboxed, fall back to a tiny local HTTP receiver started
  by launchd, or to `ctx.attention.notify` plus a marker-only bridge.
- Event names above are from OpenCode 2.1.4 client types; pin the plugin to the
  installed version and centralize the mapping in one file.

### 4. Claude Code hook adapter

`~/.claude/hooks/tmux-agent-notify.sh` reads the hook JSON from stdin and maps
it:

| Claude event | State | Message |
|---|---|---|
| `Notification` / `permission_prompt` | `blocked` | `message` |
| `Notification` / `elicitation_dialog` | `blocked` | `message` |
| `Notification` / `agent_needs_input` | `blocked` | `message` |
| `Notification` / `idle_prompt` | `done` | `message` (only if previous state was `working`) |
| `Notification` / `agent_completed` | `done` | `message` |
| `Stop` | `done` | session title |
| `StopFailure` | `error` | error type |
| `SubagentStop` | — | ignored (noise) |
| `SessionEnd` | `idle` | — |

Settings additions (merged into the existing `~/.claude/settings.json`):

```jsonc
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/tmux-agent-notify.sh",
            "async": true
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/tmux-agent-notify.sh",
            "async": true
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/tmux-agent-notify.sh",
            "async": true
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/tmux-agent-notify.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

`Stop` and `agent_completed` may both fire for one turn; the helper dedupes by
state + session key + cooldown.

### 5. Generic wrapper (optional, phase 4)

```sh
agent-run -- <command>   # sets working, then done/error from the exit code
```

Useful for `opencode run`, `claude -p`, scripts, and anything without hooks.
Not needed for the interactive TUIs.

## Rollout

| Phase | Deliverable | Acceptance |
|---|---|---|
| 0 | Review this spec; decide open questions | approved |
| 1 | `agent-notify` + `agent-focus` + tmux snippet + manual tests | marker, toast, click-to-focus work for a manual event |
| 2 | OpenCode TUI plugin + event mapping | permission prompt and turn completion notify exactly once, in the right pane |
| 3 | Claude Code hooks | `permission_prompt` and `Stop` notify exactly once |
| 4 | Polish: sounds, retry escalation, 5-min reminder, `agent-run`, log tuning | a full day of real use without false or duplicate alerts |

## Test Plan

1. `agent-notify --state blocked --message test` from a pane → marker turns red,
   toast appears when another window is active, click focuses that pane.
2. Focus the pane → `done` marker clears; `blocked` marker does not.
3. Run two agents in two panes of the same window → window marker shows the
   worst state; pane borders show the exact pane.
4. OpenCode: trigger a permission prompt → one blocked toast; approve → marker
   returns to `working`; finish → one done toast only if unfocused.
5. OpenCode: run the same session in two panes → no duplicate notifications
   (tab filter).
6. OpenCode: subagent finishes → no notification.
7. Claude: trigger `permission_prompt` and `Stop` → one notification each; no
   `SubagentStop` noise.
8. `sh -c 'exit 1'` with `remain-on-exit failed` → one `pane-died` error toast.
9. Detach all clients, trigger blocked → notification still appears; marker is
   present on reattach.
10. Rate limit/retry → no toast at first; one toast after 60s if still retrying.
11. Leave a blocked pane idle for 5 minutes → exactly one reminder.
12. `allow-passthrough` remains `off`; no pane can emit OSC to Ghostty.

## Decisions

- Decision: notify on every completed root-session turn when the pane is not
  focused; 10s cooldown; no sound.
  Reason: reviewed choice. The unfocused check is the noise control, not a
  duration threshold.
- Decision: install `terminal-notifier`; keep `osascript` as fallback.
  Reason: reviewed choice. `terminal-notifier` is the only transport that gives
  click-to-focus and per-pane notification replacement.
- Decision: play sounds for `blocked` and `error`; stay silent for `done`.
  Reason: reviewed choice. Sound is reserved for states that need action.
- Decision: send one reminder after 5 minutes blocked, then stop.
  Reason: reviewed choice. It covers stepping away without turning into a
  recurring alarm.
- Decision: enable Claude Code hooks globally in `~/.claude/settings.json`.
  Reason: the same workflow runs across multiple repos; a project-local hook
  would be forgotten outside `neobuni`.
- Decision: do not depend on `accessd/tmux-agent-indicator`; borrow its
  reset-on-focus idea and its Codex hook mapping only.
  Reason: its OpenCode adapter is V1-only and does not run on OpenCode 2.1.4,
  it cannot identify the originating pane, and it has no error state or
  click-to-focus. Running two state systems would also fight over the same tmux
  styles.
- Decision: tmux is the notification router; agents are event sources.
  Reason: one policy, identical UX across OpenCode, Claude Code, and scripts.
- Decision: persistent tmux markers are mandatory; desktop toasts are best-effort.
  Reason: a missed toast must not lose the fact that a pane needs attention.
- Decision: no OSC passthrough; use `terminal-notifier`/`osascript`.
  Reason: passthrough lets any pane write arbitrary escapes to the terminal and
  only works for visible panes when set to `on`.
- Decision: `blocked` and `error` are sticky; `done` clears on focus.
  Reason: focus is acknowledgement for completion, not for a pending decision.
- Decision: notify on transitions only, deduped by request key.
  Reason: OpenCode and Claude both emit bursts of related events.
- Decision: ignore subagent completions.
  Reason: they are frequent and the parent turn is the user-visible unit.
- Decision: include `session:window.pane` in the title and focus the exact pane
  on click.
  Reason: with 10+ panes, "a job finished" without a location is useless.

## Progress

- [x] Audit tmux/Ghostty/agent capabilities.
- [x] Draft state model, notification matrix, and integration mapping.
- [x] Evaluate `tmux-agent-indicator`; decided to borrow, not adopt.
- [x] Resolve policy choices with the user.
- [ ] Approve the spec.
- [ ] Phase 1: helper scripts + tmux config.
- [ ] Phase 2: OpenCode TUI plugin.
- [ ] Phase 3: Claude Code hooks.
- [ ] Phase 4: sound/reminder polish + one-day real-use tuning.

## Last Done

- Wrote this spec and verified the local environment assumptions.
- Evaluated `accessd/tmux-agent-indicator` at `553c3cc`; its OpenCode adapter is
  V1-only and does not run on OpenCode 2.1.4, so it is not adopted.
- Resolved the four policy questions: unfocused-turn done notifications,
  terminal-notifier, blocked/error sounds, one 5-minute reminder.

## Next Exact Step

1. Get approval on this document.
2. Create `~/.config/tmux/agent-notify` and `agent-focus`, then source
   `~/.config/tmux/agent-notifications.tmux` from `~/.tmux.conf`.
3. Verify with a manual `agent-notify --state blocked --message test` before
   wiring any agent.

## Open Questions

- None blocking. Claude hooks will be global; a project can opt out later with a
  local settings override if the noise is unwanted.


## Risks

- **TUI plugin API is new.** Event names and `spawn` availability may change.
  Mitigation: pin the OpenCode version, keep the event mapping in one file, add
  a manual fallback command.
- **Duplicate sources.** Claude may fire both `Stop` and `agent_completed`;
  OpenCode may fire both `execution.succeeded` and `idle`. Mitigation: state +
  key dedupe and cooldowns, never notify on `idle`.
- **Notification fatigue.** Mitigation: unfocused-only for done, no subagents,
  no retries before 60s, and an event log to measure.
- **Sensitive text on the lock screen.** Mitigation: default messages are action
  types, not full commands; `--detail` is opt-in.
- **Stale markers** after tmux-resurrect/continuum restores a pane. Mitigation:
  markers are ephemeral and reset by `idle`/focus; optionally clear all
  `@pane_agent_*` options on tmux server start.
- **Focus detection fragility.** `lsappinfo` is stable on macOS, but if it
  fails the helper treats the pane as unfocused, which favors notifying over
  staying silent.

## Reopen These Files

- https://github.com/accessd/tmux-agent-indicator (evaluated, not adopted)
- `~/.tmux.conf`
- `~/.config/tmux/agent-notifications.tmux`
- `~/.config/tmux/agent-notify`
- `~/.config/opencode/plugins/tmux-notify/tui.ts`
- `~/.claude/settings.json`
- `~/.claude/hooks/tmux-agent-notify.sh`
