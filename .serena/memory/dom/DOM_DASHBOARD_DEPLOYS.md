---
name: Dashboard Deploys (dev -> test -> live)
description: Deploy flow for test/live cards including the inline confirm panel and optional combined sync.
metadata:
  type: domain
obligations:
  - Pass `cc` to `api.deploy()` only when no sync is requested (`cc: msg.cc && !msg.sync`); otherwise pass `cc` to the trailing `cloneContent` call.
  - Offer sync fields in the deploy confirm only for the test card (`sync: env === 'test'`); live offers `cc` only.
---

[new-memory-justified: orchestrator-assigned split of FEATURE_DASHBOARD into one domain memory per action (deploys/clear-cache/content-sync); distinct from dom/DOM_DASHBOARD_CONNECTION_MODE which covers SFTP/Git mode switching, not deploy/cache/sync actions]

## Flow

| Step | Code location (file:function) | Notes |
| ---- | ------------------------------ | ----- |
| User clicks deploy button | `media/main.js:deployEnv(env)` | `env` is `'test'` or `'live'`; note textarea value read from `${env}-note` |
| Inline confirm opens | `media/main.js:deployEnv` -> `openConfirm(env, {...})` | Message: `Deploy ${count} commit(s) to ${ENV}?`; `sync: env === 'test'` (live never offers sync fields, only `cc`); `cc: true`; `yesLabel: 'Deploy'` |
| Confirm fields | `media/main.js:confirmFieldsHtml` | When `opts.sync`: renders Sync-from select + Database/Files checkboxes (all unchecked by default); always renders Clear-caches-afterwards checkbox when `opts.cc` |
| Button enablement | `media/main.js:skeleton()` (disabled logic), `media/main.js:syncButtons()` | Deploy button disabled unless note non-empty AND `pendingCounts[env]` > 0 |
| Request sent | `media/main.js:deployEnv` -> `request({ type: 'deploy', site, env, note, count, cc, sync })` | `sync` is `{from, db, files}` or `null`; `cc` is the confirm's cc checkbox value |
| Message routed | `src/panel.js:DashboardViewProvider/route` | Dispatches to `handle()`, posts result or `{type:'error'}` back by `requestId` |
| Message handled | `src/panel.js:DashboardViewProvider/handle` (`case 'deploy'`) | Calls `this.api.deploy(site, env, note, { cc: msg.cc && !msg.sync })` — cc goes on the deploy call ONLY when no sync is requested; if `msg.sync`, also calls `this.api.cloneContent(site, msg.sync.from, msg.env, {db, files, cc: msg.cc})` afterwards — cc rides on the trailing clone instead |
| Terminus call + wait | `src/api.js:PantheonApi/deploy` | Runs `env:deploy` with `--note=`; optional `--cc`; then calls `waitForEnv` |
| Workflow settle wait | `src/api.js:PantheonApi/waitForEnv` | Polls `workflow:list` every `POLL_MS` until workflows started since the call are terminal; `BACKGROUND_WORKFLOWS` regex excludes housekeeping flows; default timeout `WAIT_TIMEOUT_MS` |
| Success feedback | `src/panel.js` (`case 'deploy'`) | `vscode.window.showInformationMessage` fires; returns `{type:'pending', env, commits}` |
| UI settle | `media/main.js:deployEnv` | Clears note field, calls `renderPending(env, commits)`, clears spinner |
| Downstream refresh | `media/main.js:deployEnv` -> `refreshDownstream(env)` | `DOWNSTREAM` map: `dev` -> `['test','live']`, `test` -> `['live']`, `live` -> `[]`; re-fetches pending-commit counts for every downstream env, success or failure |

## Envs / direction

- Only `test` and `live` cards expose a deploy button (`deployCard()` in `media/main.js:skeleton`).
- Direction is fixed by label, not configurable: `test` card = "Deploy Dev -> Test"; `live` card = "Deploy Test -> Live".
- Live deploy confirm offers `cc` only (no sync fields) — `sync: env === 'test'` in `media/main.js:deployEnv` is `false` for live. Test deploy confirm offers Sync-from/Database/Files/Clear-caches, all unchecked by default.
- Cancel: closing the inline confirm resolves `null`; `deployEnv` returns with no request sent. No `deployCancelled` response type exists.

## Shared Inline Confirm Mechanics (`media/main.js`)

- One inline confirm per card: `#${key}-confirm` (`.slide`, `inert` when closed), plus `-msg`, `-fields`, `-yes`, `-cancel` child ids; sync-specific fields add `-from`, `-db`, `-files`; cc adds `-cc`.
- `openConfirm(key, { message, sync, cc, yesLabel, requireContent })` renders the panel and resolves `null` (Cancel) or `{ from, db, files, cc }` (Yes) — only the fields requested via `opts` are populated.
- Opening a new confirm on a card that already has one open resolves the old one `null` first (`closeConfirm`).
- No native dialog (`vscode.window.showWarningMessage`) exists anywhere in `src/panel.js` for deploy — the previously-documented "dead `deployCancelled` client code with no server emission" discrepancy is resolved: current code has no `deployCancelled` type on either side.

## Related

- `mem:feature/FEATURE_DASHBOARD`
- `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`
- `mem:spec/SPEC_DASHBOARD_DEPLOY`
