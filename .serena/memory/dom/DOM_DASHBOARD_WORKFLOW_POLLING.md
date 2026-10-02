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

## Downstream Refresh (`media/main.js`)

- `DOWNSTREAM` map: `dev -> [test, live]`, `test -> [live]`, `live -> []`. A multidev env feeds nothing downstream.
- `refreshDownstream(key)`: no-op if `key === 'dev'` and the selected dev-card env (`state.devEnv`) is a multidev, not `dev` itself; otherwise calls `refreshPending` for each env in `DOWNSTREAM[key]`.
- Called from `commitDev`, `syncDev` (push), and `deployEnv` — AFTER `setBusy(key, false)`, unconditionally after the try/catch, so a failed workflow still triggers a downstream refresh since Pantheon may have partially applied the change.
- `refreshPending(env)` re-requests `{ type: 'pending', site, env }` and re-renders the env's commit list and badge count.
- Spinner/busy state (`setBusy`) is cleared independently of the downstream refresh — the card's own spinner settles as soon as its own request resolves/rejects; the downstream cards get their own separate spinner cycle via `refreshPending`.

## Related

- `mem:feature/FEATURE_DASHBOARD`
- `mem:spec/SPEC_DASHBOARD_WORKFLOWS`
