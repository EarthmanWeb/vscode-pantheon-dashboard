---
name: Dashboard Content Sync (database/files between envs)
description: Sync Content flow (inline confirm, direction guards) including the server-side live-target enforcement fact.
metadata:
  type: domain
obligations:
  - Require at least one of Database/Files checked before enabling the inline confirm's Sync button (`requireContent: true`).
  - Never render a sync button/panel on the live card (`SYNC_KEYS = ['dev', 'test']`); treat this as a UI-only guard, not a server-side one.
---

[new-memory-justified: orchestrator-assigned split of FEATURE_DASHBOARD into one domain memory per action (deploys/clear-cache/content-sync); distinct from dom/DOM_DASHBOARD_CONNECTION_MODE which covers SFTP/Git mode switching, not the sync action]

## Flow

| Step | Code location (file:function) | Notes |
| ---- | ------------------------------ | ----- |
| Sync icon button | `media/main.js:skeleton()` -> `actions(key)` | Only rendered when `SYNC_KEYS.includes(key)`; `SYNC_KEYS = ['dev', 'test']` — `live` excluded |
| Click handler | `media/main.js:skeleton()` wiring | `document.querySelectorAll('[data-sync]')` -> `toggleSyncConfirm(key)`; clicking the icon again while that card's sync confirm is open (yesLabel `'Sync'`) closes it instead of reopening |
| Inline confirm opens | `media/main.js:syncContent(key)` -> `openConfirm(key, {...})` | Message: `Sync content into ${to}`; `sync: true`, `cc: true`, `yesLabel: 'Sync'`, `requireContent: true` (Sync button disabled until Database or Files is checked) |
| Confirm fields | `media/main.js:confirmFieldsHtml` | Sync-from `<select>` populated from `['dev','test','live', ...state.multidevs]` filtered to exclude the target itself; Database/Files checkboxes unchecked by default; Clear-caches-afterwards checkbox |
| Target resolution | `media/main.js:syncTarget(key)` | `key === 'dev'` -> `state.devEnv`, else `key` itself (`test`) |
| Request sent | `media/main.js:syncContent(key)` -> `request({type:'syncContent', site, from, to, db, files, cc})` | Only sent after the confirm resolves non-null |
| Message routed | `src/panel.js:DashboardViewProvider/route` | Dispatches to `handle()` |
| Message handled | `src/panel.js:DashboardViewProvider/handle` (`case 'syncContent'`) | Calls `this.api.cloneContent(site, from, to, {db, files, cc})` unconditionally — no pre-check, no confirm, no target-env restriction; fires `vscode.window.showInformationMessage` naming what was synced; returns `{type:'contentSynced'}` |
| Terminus call + wait | `src/api.js:PantheonApi/cloneContent` | Runs `env:clone-content --yes`; throws if neither `db` nor `files` set; `--db-only` when `!files`, `--files-only` when `!db`; optional `--cc`; waits via `waitForEnv(site, to, since, CLONE_TIMEOUT_MS)` — long timeout (`CLONE_TIMEOUT_MS` = 1 hour: large-site DB clones run past the default 10-minute wait) |
| UI settle | `media/main.js:syncContent` | On `res.type === 'contentSynced'`: closes the panel implicitly (confirm already closed on Yes), shows `Synced ${from} -> ${to}.` status block |

## Direction / guard rules — live-target restriction is UI-ONLY, confirmed

- `live` is never offered as a sync **target** in the webview: `SYNC_KEYS` excludes `live`, so no sync button/panel renders on the live card.
- This restriction is **NOT enforced server-side**. Checked directly in `src/panel.js:handle` (`case 'syncContent'`) and `src/api.js:cloneContent` — neither validates `to`/`env` against an allowed-target list. A hand-crafted `syncContent` message with `to: 'live'` (e.g. via a modified webview or direct `postMessage` from a malicious/compromised script context) would still execute `env:clone-content` against live with no guard.
- `live` CAN be a sync **source** — the `from` select includes `live` when syncing into `dev` or `test` (excluded only when it equals the target itself).
- Combined deploy+sync path (`msg.sync` on a `deploy` or `push` message) reuses `cloneContent` directly from `src/panel.js` `case 'deploy'` / `case 'push'` — see `mem:dom/DOM_DASHBOARD_DEPLOYS`. The test-deploy confirm is the only deploy path that offers sync; live-deploy's confirm has no sync fields (`sync: env === 'test'` in `media/main.js:deployEnv`), so combined deploy+sync into live is not reachable from the deploy UI either — but still not blocked at the `syncContent` message layer directly.

## Confirm gating (resolved — no longer missing)

- `syncContent` IS now gated by a confirm: `media/main.js:syncContent` opens the shared inline confirm panel (`openConfirm`) before sending the request; Cancel resolves `null` and no request is sent.
- The confirm is client-side only (webview inline panel, not a native `vscode.window.showWarningMessage`) — `src/panel.js:handle` `case 'syncContent'` still has no server-side pre-check, consistent with the "live-target is UI-only" fact above: the confirm protects against accidental clicks, not against a malformed message bypassing the UI.

## Related

- `mem:feature/FEATURE_DASHBOARD`
- `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`
- `mem:spec/SPEC_DASHBOARD_CONTENT_SYNC`
