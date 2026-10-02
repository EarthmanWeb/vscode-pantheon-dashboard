---
name: Dashboard Clear Caches (per-env icon button)
description: Per-env Clear Caches icon button flow — API call, message route, webview spinner.
metadata:
  type: domain
obligations:
  - Route new cache-clear calls through `src/api.js` `clearCache()`; never call `terminus()` directly from `panel.js` or `media/main.js`.
  - Keep the `data-clear` icon button present on every card (`dev`, `test`, `live`) if adding a new card key — `clearCache` has no env restriction, unlike content sync.
---

[new-memory-justified: orchestrator-assigned split of FEATURE_DASHBOARD into one domain memory per action (deploys/clear-cache/content-sync); distinct from dom/DOM_DASHBOARD_CONNECTION_MODE which covers SFTP/Git mode switching, not the cache action]

## Flow

| Step | Code location (file:function) | Notes |
| ---- | ------------------------------ | ----- |
| Icon button rendered | `media/main.js:skeleton()` → `actions(key)` | `iconButton` with `data-clear="${key}"`, codicon `clear-all`, present on every card (`dev`, `test`, `live`) — unlike sync, not restricted by `SYNC_KEYS` |
| Click handler | `media/main.js:skeleton()` wiring | `document.querySelectorAll('[data-clear]')` → `clearCache(btn.dataset.clear)` |
| Target env resolution | `media/main.js:clearCache(key)` | `key === 'dev'` maps to `state.devEnv` (selected dev/multidev env); otherwise `key` is the env name directly (`test`/`live`) |
| Request sent | `media/main.js:clearCache` → `request({ type: 'clearCache', site, env })` | Spinner text: "Clearing caches on {env} — waiting for Pantheon…" |
| Message routed | `src/panel.js:DashboardViewProvider/route` | Dispatches to `handle()` |
| Message handled | `src/panel.js:DashboardViewProvider/handle` (`case 'clearCache'`) | Calls `this.api.clearCache(site, env)`; fires `vscode.window.showInformationMessage`; returns `{type:'cacheCleared'}` |
| Terminus call + wait | `src/api.js:PantheonApi/clearCache` | Runs `env:clear-cache`; then `waitForEnv(site, env, since)` with default `WAIT_TIMEOUT_MS` |
| UI settle | `media/main.js:clearCache` | On `res.type === 'cacheCleared'`, shows "Caches cleared on {env}." status block; spinner clears via `setBusy(key, false)` in all cases (success or caught error) |

## Notes

- No confirm dialog gates this action — `handle()` has no pre-check (`case 'clearCache'` calls `api.clearCache` unconditionally), unlike `setMode` which has a `confirmModeSwitch` round-trip.
- `clearCache` is also invoked indirectly: `src/panel.js` `case 'push'` calls `api.clearCache` when `msg.cc` is set and no `msg.sync`; `case 'deploy'` does NOT call `clearCache` directly — it passes `cc` through to `api.deploy()`'s own `--cc` flag instead (see `mem:dom/DOM_DASHBOARD_DEPLOYS`).
- No downstream refresh is triggered after a bare cache clear (`clearCache` in `media/main.js` does not call `refreshDownstream`).

## Related

- `mem:feature/FEATURE_DASHBOARD`
- `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`
