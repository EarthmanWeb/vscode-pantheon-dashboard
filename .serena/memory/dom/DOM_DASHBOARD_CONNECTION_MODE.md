---
name: Dashboard Connection Mode Toggle
description: SFTP/Git mode toggle on the dev card, including the inline confirm for discarding uncommitted SFTP changes.
metadata:
  type: domain
obligations:
  - Route the Git-mode discard confirm through the inline webview confirm panel (`openConfirm`), never a native VS Code dialog.
  - Re-send `setMode` with `confirmed: true` only after the inline confirm resolves non-null.
---

[new-memory-justified: task assigned by orchestrator to create this domain memory; distinct scope from index/INDEX_FEATURES which is a navigation index, not a connection-mode behavior reference]

# Dashboard Connection Mode Toggle

## Flow

| Step | Code location (file:function) | Notes |
| --- | --- | --- |
| Read mode | `src/api.js:PantheonApi.connectionMode` | `terminus env:info` JSON, returns `connection_mode` field |
| Set mode | `src/api.js:PantheonApi.setMode` | `terminus connection:set <site>.<env> <mode> --yes`, then `waitForEnv`, then re-reads `connectionMode` |
| Route message | `src/panel.js:DashboardViewProvider.handle` (case `'setMode'`) | Pre-check: if `msg.mode === 'git'` and `!msg.confirmed`, calls `diffstat`; if uncommitted files exist, returns `{ type: 'confirmModeSwitch', count }` INSTEAD of switching; otherwise returns `{ type: 'devInfo', mode }` |
| UI trigger | `media/main.js:switchMode` -> `requestSetMode` | Sends `{ type: 'setMode', site, env, mode, confirmed }`; first call sends `confirmed: false` |
| UI confirm handling | `media/main.js:requestSetMode` | On `res.type === 'confirmModeSwitch'`, opens inline confirm via `openConfirm('dev', { message, yesLabel: 'Switch to Git' })`; on confirm, re-sends `requestSetMode(env, mode, true)` |
| Toggle buttons | `media/main.js` skeleton, `#dev-toggle` click handler | `data-mode="sftp"` / `data-mode="git"` buttons call `switchMode(mode)` |
| Apply mode to UI | `media/main.js:applyMode` | Sets badge text, toggles `#dev-commitbox` visibility (SFTP only), toggles `.active` class on toggle buttons |

## Inline Confirm (resolved — no longer unreachable)

- `src/panel.js` sends `{ type: 'confirmModeSwitch', count }` when SFTP->Git switch would discard uncommitted server changes.
- `media/main.js:requestSetMode` handles `confirmModeSwitch` directly: clears the dev spinner, opens the shared inline confirm panel (`#dev-confirm`) with the discard-count message, and on Yes re-sends `setMode` with `confirmed: true`.
- No native dialog (`vscode.window.showWarningMessage`) is used for this path — confirmation is entirely in-webview via `openConfirm`/`closeConfirm` (`mem:dom/DOM_DASHBOARD_DEPLOYS` documents the shared inline-confirm mechanics).
- Cancel: closing the confirm (`closeConfirm`) resolves the pending promise with `null`; `requestSetMode` returns without sending `confirmed: true`. No `*Cancelled` response type is sent or expected for this flow.

## Workflow Wait / Error Surfacing

- `setMode` polls via `waitForEnv` (shared helper, see `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`) before returning the new mode.
- Any workflow failure or timeout throws from `waitForEnv`; `src/panel.js:route` catches and posts `{ type: 'error', message }`; `media/main.js` request bridge rejects, `requestSetMode`'s catch calls `fail(err)` into `dev-status`.

## Env Scope

- Mode toggle UI only renders on the `dev` card (`#dev-toggle` lives under `card-dev`); `state.devEnv` can be `dev` or a multidev name — toggle always targets whichever env is selected in `#dev-env`.
- `test` and `live` cards have no mode toggle — Pantheon enforces Git-only on those envs.

## Related

- `mem:feature/FEATURE_DASHBOARD`
- `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`
- `mem:spec/SPEC_DASHBOARD_CONNECTION_MODE`
