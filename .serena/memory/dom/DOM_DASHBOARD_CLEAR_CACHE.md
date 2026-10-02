---
name: Dashboard Clear Caches (per-env icon button)
description: Clear-cache icon button flow including the inline confirm panel and status text.
metadata:
  type: domain
obligations:
  - Gate `clearCache` behind the inline confirm panel (`openConfirm`) before sending the request.
  - Keep status text free of "waiting for Pantheon" phrasing.
---

[new-memory-justified: orchestrator-assigned split of FEATURE_DASHBOARD into one domain memory per action (deploys/clear-cache/content-sync); distinct from dom/DOM_DASHBOARD_CONNECTION_MODE which covers SFTP/Git mode switching, not the cache action]

## Flow

| Step | Code location (file:function) | Notes |
| ---- | ------------------------------ | ----- |
| Icon button rendered | `media/main.js:skeleton()` -> `actions(key)` | `iconButton` with `data-clear="${key}"`, codicon `clear-all`, present on every card (`dev`, `test`, `live`) — unlike sync, not restricted by `SYNC_KEYS` |
| Click handler | `media/main.js:skeleton()` wiring | `document.querySelectorAll('[data-clear]')` -> `clearCache(btn.dataset.clear)` |
| Target env resolution | `media/main.js:clearCache(key)` | `key === 'dev'` maps to `state.devEnv` (selected dev/multidev env); otherwise `key` is the env name directly (`test`/`live`) |
| Inline confirm opens | `media/main.js:clearCache` -> `openConfirm(key, {...})` | Message: `Clear all caches on ${env}?`; `yesLabel: 'Yes'`; no sync/cc fields |
| Request sent | `media/main.js:clearCache` -> `request({ type: 'clearCache', site, env })` | Only sent after the confirm resolves non-null; spinner text: `Clearing caches on ${env}…` (no "waiting for Pantheon" wording) |
| Message routed | `src/panel.js:DashboardViewProvider/route` | Dispatches to `handle()` |
| Message handled | `src/panel.js:DashboardViewProvider/handle` (`case 'clearCache'`) | Calls `this.api.clearCache(site, env)` unconditionally; fires `vscode.window.showInformationMessage`; returns `{type:'cacheCleared'}` |
| Terminus call + wait | `src/api.js:PantheonApi/clearCache` | Runs `env:clear-cache`; then `waitForEnv(site, env, since)` with default `WAIT_TIMEOUT_MS` |
| UI settle | `media/main.js:clearCache` | On `res.type === 'cacheCleared'`, shows `Caches cleared on ${env}.` status block; spinner clears via `setBusy(key, false)` in all cases (success or caught error) |

## Notes

- Confirm gating moved client-side: `src/panel.js` `case 'clearCache'` itself has no pre-check (calls `api.clearCache` unconditionally) — the confirm step happens in `media/main.js:clearCache` via the shared inline confirm panel BEFORE the request is sent, not as a server round-trip. No `clearCacheCancelled` response type exists; Cancel simply never sends the request.
- `clearCache` is also invoked indirectly: `src/panel.js` `case 'push'` calls `api.clearCache` when `msg.cc` is set and no `msg.sync`; `case 'deploy'` does NOT call `clearCache` directly — it passes `cc` through to `api.deploy()`'s own `--cc` flag instead (see `mem:dom/DOM_DASHBOARD_DEPLOYS`).
- No downstream refresh is triggered after a bare cache clear (`clearCache` in `media/main.js` does not call `refreshDownstream`).

## Related

- `mem:feature/FEATURE_DASHBOARD`
- `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`
- `mem:spec/SPEC_DASHBOARD_CLEAR_CACHES`
