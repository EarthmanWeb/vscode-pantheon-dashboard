---
name: Dashboard Content Sync (database/files between envs)
description: Sync-content slide-down panel flow — API call, message route, webview UI, direction guard for the live env.
metadata:
  type: domain
obligations:
  - Route new content-sync calls through `src/api.js` `cloneContent()`; never call `terminus()` directly from `panel.js` or `media/main.js`.
  - Never add a sync-target icon/panel to the `live` card — `live` must stay out of `SYNC_KEYS` in `media/main.js` (live is a one-way deploy target only, see `mem:dom/DOM_DASHBOARD_DEPLOYS`).
---

[new-memory-justified: orchestrator-assigned split of FEATURE_DASHBOARD into one domain memory per action (deploys/clear-cache/content-sync); distinct from dom/DOM_DASHBOARD_CONNECTION_MODE which covers SFTP/Git mode switching, not the sync action]

## Flow

| Step | Code location (file:function) | Notes |
| ---- | ------------------------------ | ----- |
| Sync icon button | `media/main.js:skeleton()` → `actions(key)` | Only rendered when `SYNC_KEYS.includes(key)`; `SYNC_KEYS = ['dev', 'test']` — `live` excluded |
| Open/close slide panel | `media/main.js:toggleSync(key, open)` | Populates `${key}-sync-from` `<select>` with `['dev','test','live', ...state.multidevs]` filtered to exclude the target itself; closing resets db/files/cc checkboxes to unchecked |
| Form fields | `media/main.js:skeleton()` syncPanel template | `${key}-sync-from` (select), `${key}-sync-db`, `${key}-sync-files` (checkboxes — at least one required to enable Sync button via `syncButtons()`), `${key}-sync-cc` (clear caches afterwards) |
| Request sent | `media/main.js:syncContent(key)` → `request({type:'syncContent', site, from, to, db, files, cc})` | `to = syncTarget(key)`: `key === 'dev'` → `state.devEnv`, else `key` itself (`test`) |
| Message routed | `src/panel.js:DashboardViewProvider/route` | Dispatches to `handle()` |
| Message handled | `src/panel.js:DashboardViewProvider/handle` (`case 'syncContent'`) | Calls `this.api.cloneContent(site, from, to, {db, files, cc})`; fires `vscode.window.showInformationMessage` naming what was synced; returns `{type:'contentSynced'}` |
| Terminus call + wait | `src/api.js:PantheonApi/cloneContent` | Runs `env:clone-content --yes`; throws if neither `db` nor `files` set; `--db-only` when `!files`, `--files-only` when `!db`; optional `--cc`; waits via `waitForEnv(site, to, since, CLONE_TIMEOUT_MS)` — long timeout (`CLONE_TIMEOUT_MS` = 1 hour, per `src/api.js` comment: large-site DB clones run past the default 10-minute wait) |
| UI settle | `media/main.js:syncContent` | On `res.type === 'contentSynced'`: closes the panel (`toggleSync(key, false)`), shows "Synced {from} → {to}." status block |

## Direction / guard rules

- `live` is never a sync **target**: enforced only by UI (`SYNC_KEYS` excludes `live`, so no sync button/panel renders on the live card) — NOT enforced server-side in `src/panel.js:handle` or `src/api.js:cloneContent`. A hand-crafted `syncContent` message with `to: 'live'` would still execute.
- `live` CAN be a sync **source** — the `from` select includes `live` when syncing into `dev` or `test` (excluded only when it equals the target itself).
- Combined deploy+sync path (`msg.sync` on a `deploy` or `push` message) reuses `cloneContent` directly from `src/panel.js` `case 'deploy'` / `case 'push'` — see `mem:dom/DOM_DASHBOARD_DEPLOYS`.

## Discrepancy found (report to user, not fixed here)

- No confirm dialog gates `syncContent` (a destructive overwrite of the target env's DB/files) — `handle()` `case 'syncContent'` calls `api.cloneContent` unconditionally, no pre-check. CLAUDE.md / FEATURE_DEV_STANDARDS describe `panel.js` as owning "native confirm dialogs"; none exists in source for this action.
- The "live protection" guard is UI-only (button/panel omission), not enforced in `src/api.js` or `src/panel.js`.

## Related

- `mem:feature/FEATURE_DASHBOARD`
- `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`
