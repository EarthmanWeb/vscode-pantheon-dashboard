---
name: Dashboard Workflow Polling
description: waitForEnv polling contract shared by every mutating PantheonApi call, plus downstream refresh after a card settles.
metadata:
  type: domain
obligations:
  - Capture `since = Date.now() / 1000` BEFORE issuing the terminus/git command, then pass it to `waitForEnv`.
  - Never wait on workflows matching `BACKGROUND_WORKFLOWS` (Pantheon housekeeping) — exclude them from the poll window.
---

[new-memory-justified: orchestrator-specified new domain memory for the waitForEnv polling contract; dom/DOM_DASHBOARD_CONNECTION_MODE covers the SFTP/git mode toggle behavior, a different concern (referenced as a sibling memory in feature/FEATURE_DASHBOARD's Related Memories table), not the polling/wait mechanism itself]

# DOM_DASHBOARD_WORKFLOW_POLLING

## waitForEnv Contract (`src/api.js`)

- Signature: `waitForEnv(site, env, sinceEpoch, timeoutMs = this.waitTimeoutMs)`.
- Poll `terminus workflow:list <site>` every `pollMs` (default 4000ms) until no workflow on `env` is active.
- Workflow window: `w.env === env && w.started_at >= sinceEpoch - 120` (120s clock-skew margin) — NEVER compare `started_at` to `sinceEpoch` with no margin.
- Excluded workflows: `BACKGROUND_WORKFLOWS` regex matches Pantheon housekeeping (package index refresh, automated backup) — these run on Pantheon's own schedule, NEVER caused by a dashboard operation, and are NEVER waited on.
- Terminal statuses: `succeeded`, `failed`, `aborted` (`TERMINAL_STATUSES` set).
- Failure surfacing: when all in-window workflows are terminal and one has `status === 'failed'`, throw `Pantheon workflow failed: <workflow name>` — the FIRST failed workflow found, not all of them.
- Timeout: if any workflow is still active past `deadline = Date.now() + timeoutMs`, throw `Timed out waiting for workflows on <env>: <comma-joined active workflow names>`.
- Default timeout `WAIT_TIMEOUT_MS` = 10 minutes; `cloneContent` overrides with `CLONE_TIMEOUT_MS` = 60 minutes (database clones of large sites run long).
- `pollMs` and `waitTimeoutMs` are constructor options on `PantheonApi` — tests inject small values (`pollMs: 1`) to avoid real sleeps.

## Callers (every one captures `since` first, then waits)

| Method         | Command issued before waiting              |
| -------------- | -------------------------------------------- |
| `setMode`      | `connection:set <site.env> <mode> --yes`    |
| `commit`       | `env:commit <site.env> --message=<msg>`     |
| `deploy`       | `env:deploy <site.env> --note=<note>`       |
| `clearCache`   | `env:clear-cache <site.env>`                |
| `cloneContent` | `env:clone-content <site.from> <to> --yes [--db-only|--files-only] [--cc]` — waits on `to`, with `CLONE_TIMEOUT_MS` |
| `push`         | `git push origin <branch>` — waits on `env` (Pantheon deploys the pushed branch) |

`listSites`, `listMultidevs`, `connectionMode`, `diffstat`, `unpushedCommits`, `pendingCommits`, `whoami` are read-only and do NOT call `waitForEnv`.

## Background Workflow Watch (any origin)

- Single-flight list (`src/api.js:202-211` `workflowList(site)`): records `this.workflowListInflight = { site, promise }`, cleared in `.finally` when still the same entry. `activeWorkflows` (`:217-221`) reuses that in-flight promise when `inflight.site === site`, else calls `workflowList`. `waitForEnv` (`:293`) ALWAYS calls `workflowList` directly — NEVER joins an older call, so its data NEVER predates the mutation it waits on.
- Host: `src/api.js:PantheonApi.activeWorkflows(site)` — ONE (possibly shared in-flight) `workflow:list <site>` call, returns `{ active, finished }`. `active` = `{ <env>: [<workflow name>, ...] }` for non-terminal workflows not matching `BACKGROUND_WORKFLOWS`; `{}` when none. `finished` = `{ <env>: <id> }` — id of the newest (largest `finished_at`) terminal (succeeded/failed/aborted) non-`BACKGROUND_WORKFLOWS` workflow on that env; env absent when none. Read-only, NEVER calls `waitForEnv`. Routed by `src/panel.js` `case 'workflows'` → `{ type: 'workflows', active, finished }`.
- Webview: `media/main.js:pollWorkflows` (`:648`), started in `init()` via `startWorkflowPolling`; skips a tick while a poll is in flight, `document.hidden`, or no `state.site`.
- Cadence: self-scheduling `setTimeout` chain (`scheduleWorkflowPoll`, single timer) — `WORKFLOW_POLL_MS` = 5000ms while any workflow is active (`anyActive`), any card is watched, or any card has class `busy`; `WORKFLOW_IDLE_POLL_MS` = 15000ms otherwise (`workflowPollDelay`; constants `media/main.js:638-639`). First tick 5000ms after start. `visibilitychange` to visible → clear timer, poll immediately, reschedule (`:726-731`).
- Card env: `cardEnv(key)` — dev card → `state.devEnv` (dev or selected multidev), test/live → key.
- Watch start: card idle (not busy, not watched) and `active[env]` non-empty → `watching[key] = env`, `setBusy(key, true)`, spinner `<names> running on <env>…`.
- Watch end: first poll with no active workflow on the watched env, or dev-card env changed → clear watch, `setBusy(false)`, clear status, `syncButtons()`, reload via the local `reload(key)` helper (`refreshDev` / `refreshPending`, then `refreshDownstream(key)`).
- A card busy with its OWN operation is never taken over — its own `waitForEnv` already drives its spinner.
- Poll error → `fail(err)` on every idle, unwatched card.

### Settle detection (finished id)

- Response carries `finished` = `{ <env>: <id of newest terminal workflow by finished_at> }` (`src/api.js:226-239`). Webview keeps `lastFinished` (env→id) + `baselined`; both updated at the end of every successful poll (`media/main.js:696-697`).
- First successful poll only records the baseline — NO refresh.
- Later polls (`media/main.js:686-692`): `baselined`, card idle (not watching, not busy), no active workflow on its env, and `finished[cardEnv(key)] !== lastFinished[cardEnv(key)]` → `reload(key)` (card reload + `refreshDownstream`). A changed id fires even when the workflow started and ended between two polls (never seen as active).
- Skip a key whose watch ended this poll (no double refresh).
- Covers: workflows that start+finish between two polls (5s busy / 15s idle); workflows that ran while `document.hidden` (baseline survives hidden ticks; first visible poll catches it); failed/aborted runs.
- Poll error leaves the baseline unchanged.
- A card busy with its own op is NOT refreshed by this path.
- Accepted: one redundant refresh possible after a card's own op when no poll fell between workflow end and op settle.

## Downstream Refresh (`media/main.js`)

- `DOWNSTREAM` map: `dev -> [test, live]`, `test -> [live]`, `live -> []`. A multidev env feeds nothing downstream.
- `refreshDownstream(key)`: no-op if `key === 'dev'` and the selected dev-card env (`state.devEnv`) is a multidev, not `dev` itself; otherwise calls `refreshPending` for each env in `DOWNSTREAM[key]`.
- Called from `commitDev`, `syncDev` (push), and `deployEnv` — AFTER `setBusy(key, false)`, unconditionally after the try/catch, so a failed workflow still triggers a downstream refresh since Pantheon may have partially applied the change.
- `refreshPending(env)` re-requests `{ type: 'pending', site, env }` and re-renders the env's commit list and badge count.
- Spinner/busy state (`setBusy`) is cleared independently of the downstream refresh — the card's own spinner settles as soon as its own request resolves/rejects; the downstream cards get their own separate spinner cycle via `refreshPending`.

## Related

- `mem:feature/FEATURE_DASHBOARD`
- `mem:spec/SPEC_DASHBOARD_WORKFLOWS`
