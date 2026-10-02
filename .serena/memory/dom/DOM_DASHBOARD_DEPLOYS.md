---
name: Dashboard Deploys (dev → test → live)
description: Deploy-to-env flow (test/live cards) — API call, message route, webview UI, workflow wait, downstream refresh.
metadata:
  type: domain
obligations:
  - Route new deploy-related Terminus calls through `src/api.js` `deploy()`; never call `terminus()` directly from `panel.js` or `media/main.js`.
  - After any change to a deploy path, verify `refreshDownstream()` in `media/main.js` still re-fetches every env listed for that key in `DOWNSTREAM`.
---

[new-memory-justified: orchestrator-assigned split of FEATURE_DASHBOARD into one domain memory per action (deploys/clear-cache/content-sync); distinct from dom/DOM_DASHBOARD_CONNECTION_MODE which covers SFTP/Git mode switching, not deploy/cache/sync actions]

## Flow

| Step | Code location (file:function) | Notes |
| ---- | ------------------------------ | ----- |
| User clicks deploy button | `media/main.js:deployEnv(env)` | `env` is `'test'` or `'live'`; note textarea value read from `${env}-note` |
| Button enablement | `media/main.js:skeleton()` (disabled logic), `media/main.js:syncButtons()` | Disabled unless note non-empty AND `pendingCounts[env]` > 0 |
| Request sent | `media/main.js:deployEnv` → `request({ type: 'deploy', site, env, note, count })` | `request()` keys response by `requestId` (webview bridge) |
| Message routed | `src/panel.js:DashboardViewProvider/route` | Dispatches to `handle()`, posts result or `{type:'error'}` back by `requestId` |
| Message handled | `src/panel.js:DashboardViewProvider/handle` (`case 'deploy'`) | Calls `this.api.deploy(site, env, note, {cc: ...})`; if `msg.sync` present, also calls `cloneContent` into the deployed env after deploy completes |
| Terminus call + wait | `src/api.js:PantheonApi/deploy` | Runs `env:deploy` with `--note=`; optional `--cc` flag; then calls `waitForEnv` |
| Workflow settle wait | `src/api.js:PantheonApi/waitForEnv` | Polls `workflow:list` every `POLL_MS` until workflows started since the call are terminal; `BACKGROUND_WORKFLOWS` regex excludes housekeeping flows; default timeout `WAIT_TIMEOUT_MS` |
| Success feedback | `src/panel.js` (`case 'deploy'`) | `vscode.window.showInformationMessage` fires; returns `{type:'pending', env, commits}` |
| UI settle | `media/main.js:deployEnv` | Clears note field, calls `renderPending(env, commits)`, clears spinner |
| Downstream refresh | `media/main.js:deployEnv` → `refreshDownstream(env)` | `DOWNSTREAM` map: `dev` → `['test','live']`, `test` → `['live']`, `live` → `[]`; re-fetches pending-commit counts for every downstream env, success or failure |

## Envs / direction

- Only `test` and `live` cards expose a deploy button (`deployCard()` in `media/main.js:skeleton`).
- Direction is fixed by label, not configurable: `test` card = "Deploy Dev → Test"; `live` card = "Deploy Test → Live".
- Optional combined deploy+sync: `msg.sync` on the `deploy` message additionally triggers `cloneContent` for the same target env after deploy (`src/panel.js` `case 'deploy'`); when `msg.sync` is set, `cc` is NOT passed to `deploy()` (passed to the trailing `cloneContent` call instead) — see `src/panel.js:handle` `cc: msg.cc && !msg.sync`.

## Discrepancy found (report to user, not fixed here)

- CLAUDE.md / FEATURE_DEV_STANDARDS describe `panel.js` as owning "native confirm dialogs." No `confirm()` call, `showWarningMessage`, or modal dialog exists anywhere in the repo (`src/panel.js`, `media/main.js`, `extension.js`) for deploy. `media/main.js:deployEnv` checks for a `res.type === 'deployCancelled'` response, but `src/panel.js:handle` never returns that type for `case 'deploy'` — the cancel path is dead client code with no corresponding server emission.

## Related

- `mem:feature/FEATURE_DASHBOARD`
- `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`
