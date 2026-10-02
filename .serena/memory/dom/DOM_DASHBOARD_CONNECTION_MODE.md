---
name: Dashboard Connection Mode Toggle
description: SFTP/Git connection-mode switch for the dev env end to end — API call, confirm-dialog gap, webview toggle state.
metadata:
  type: domain
obligations:
  - Route every connectionMode/setMode call through src/api.js; never call terminus connection:set elsewhere.
  - Fix or re-wire the confirmModeSwitch/setModeCancelled mismatch before relying on the confirm-before-switch flow — it is currently dead code.
---

[new-memory-justified: task assigned by orchestrator to create this domain memory; distinct scope from index/INDEX_FEATURES which is a navigation index, not a connection-mode behavior reference]

# Dashboard Connection Mode Toggle

## Flow

| Step | Code location (file:function) | Notes |
| --- | --- | --- |
| Read mode | `src/api.js:PantheonApi.connectionMode` | `terminus:env:info` JSON, returns `connection_mode` field |
| Set mode | `src/api.js:PantheonApi.setMode` | `terminus:connection:set <site>.<env> <mode> --yes`, then `waitForEnv`, then re-reads `connectionMode` |
| Route message | `src/panel.js:DashboardViewProvider.handle` (case `'setMode'`) | Pre-check: if `msg.mode === 'git'` and `!msg.confirmed`, calls `diffstat`; if uncommitted files exist, returns `{ type: 'confirmModeSwitch', count }` INSTEAD of switching |
| UI trigger | `media/main.js:switchMode` | Sends `{ type: 'setMode', site, env: state.devEnv, mode }`; no `confirmed` field ever sent |
| UI result handling | `media/main.js:switchMode` | Checks `res.type === 'setModeCancelled'` only |
| Toggle buttons | `media/main.js` skeleton, `#dev-toggle` click handler | `data-mode="sftp"` / `data-mode="git"` buttons call `switchMode(mode)` |
| Apply mode to UI | `media/main.js:applyMode` | Sets badge text, toggles `#dev-commitbox` visibility (SFTP only), toggles `.active` class on toggle buttons |

## Confirmed Discrepancy

- `src/panel.js` sends `{ type: 'confirmModeSwitch', count }` when SFTP→Git switch would discard uncommitted server changes.
- `media/main.js:switchMode` never checks for `res.type === 'confirmModeSwitch'` and never sends `confirmed: true` on a retry — it only checks for `'setModeCancelled'`, a type `panel.js` never sends.
- Net effect: switching dev to Git mode with uncommitted SFTP diffstat entries resolves with an unhandled response shape; the confirm-before-switch path is unreachable from the webview.
- Resolve by: either add a native confirm dialog in `panel.js` (like `clearCache`/`syncContent` cases use `vscode.window.showWarningMessage`) instead of round-tripping through the webview, OR add an `if (res.type === 'confirmModeSwitch')` branch in `main.js:switchMode` that confirms and resends with `confirmed: true`.

## Workflow Wait / Error Surfacing

- `setMode` polls via `waitForEnv` (shared helper, see `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`) before returning the new mode.
- Any workflow failure or timeout throws from `waitForEnv`; `src/panel.js:route` catches and posts `{ type: 'error', message }`; `media/main.js` request bridge rejects, `switchMode`'s catch calls `fail(err)` into `dev-status`.

## Env Scope

- Mode toggle UI only renders on the `dev` card (`#dev-toggle` lives under `card-dev`); `state.devEnv` can be `dev` or a multidev name — toggle always targets whichever env is selected in `#dev-env`.
- `test` and `live` cards have no mode toggle — Pantheon enforces Git-only on those envs.

## Related

- `mem:feature/FEATURE_DASHBOARD`
- `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`
