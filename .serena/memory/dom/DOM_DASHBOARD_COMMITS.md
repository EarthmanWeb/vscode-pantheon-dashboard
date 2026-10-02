---
name: Dashboard Commits, Push, and Pending Deploys
description: SFTP diffstat/commit, local unpushed-commit tracking and push, and dev/test/live pending-commit (code-log) flows.
metadata:
  type: domain
obligations:
  - Always pass fetch:false for the background poll (pollUnpushed) — only the explicit Refresh/devInfo path fetches origin.
  - Keep pendingCommits' source-env mapping (test→dev, live→test) in sync between src/api.js and any UI label changes.
---

[new-memory-justified: task assigned by orchestrator to create this domain memory covering commit/push/pending-deploy mechanics; feature/FEATURE_DASHBOARD is the parent feature memory being written in parallel by another agent and index/INDEX_FEATURES is a navigation index, neither duplicates this code-location reference]

# Dashboard Commits, Push, and Pending Deploys

## SFTP Diffstat + Commit (dev env only, SFTP mode)

| Behaviour | Code location (file:function) | Notes |
| --- | --- | --- |
| List uncommitted server files | `src/api.js:PantheonApi.diffstat` | `terminus:env:diffstat <site>.<env>` JSON; normalizes object-shaped response into `{file, status, additions, deletions}[]` |
| Commit server changes | `src/api.js:PantheonApi.commit` | `terminus:env:commit <site>.<env> --message=<msg>`, then `waitForEnv`; returns nothing — caller re-fetches diffstat |
| Route `'diffstat'` | `src/panel.js:handle` case `'diffstat'` | Returns `{ type: 'diffstat', files }` |
| Route `'commit'` | `src/panel.js:handle` case `'commit'` | Calls `api.commit` then `api.diffstat`, returns `{ type: 'diffstat', files }` (reuses diffstat shape) |
| Render | `media/main.js:renderDiffstat` | Empty-state message when no files; else table with +additions/−deletions per file |
| Commit UI | `media/main.js:commitDev` | Reads `#dev-message`, posts `'commit'`, clears textarea, re-renders diffstat, calls `refreshDownstream('dev')` |

## Unpushed Local Commits (dev env only, Git mode)

| Behaviour | Code location (file:function) | Notes |
| --- | --- | --- |
| List unpushed | `src/api.js:PantheonApi.unpushedCommits(branch, {fetch})` | Optional `git fetch origin <branch>`, then `git log origin/<branch>..<branch> --format=%H%x1f%an%x1f%ad%x1f%s` (unit-separator-delimited: hash/author/datetime/message) |
| Branch mapping | `src/panel.js:handle` case `'unpushed'` | `branch = env === 'dev' ? 'master' : env` — dev maps to `master`, multidevs use their own branch name |
| Route | `src/panel.js:handle` case `'unpushed'` | Returns `{ type: 'unpushed', branch, commits }`; `msg.fetch` passed straight through to `unpushedCommits` |
| Render | `media/main.js:renderUnpushed` | Sets `state.unpushedCount`/`state.unpushedSig` (hash-joined signature); shows "Sync to {label}" button when commits exist |
| Background poll | `media/main.js:pollUnpushed` | Every `LOCAL_POLL_MS` (5000ms) when dev card is in Git mode, idle, and tab visible; sends `unpushed` with `fetch: false` (no network call) — only re-renders if signature changed |
| Push | `src/api.js:PantheonApi.push(site, env, branch)` | `git push origin <branch>`, then `waitForEnv` |
| Push route | `src/panel.js:handle` case `'push'` | Native confirm (`vscode.window.showWarningMessage`, modal) before calling `api.push`; returns `{ type: 'pushCancelled' }` on decline, else re-fetches `unpushedCommits` (fetch defaults true) and returns `{ type: 'unpushed', branch, commits }` |
| Push UI | `media/main.js:syncDev` | Triggered by "Sync to {label}" button; handles `pushCancelled`; on success re-renders unpushed list, calls `refreshDownstream('dev')` |

## Pending Commits (test/live envs — code-log, deploy source)

| Behaviour | Code location (file:function) | Notes |
| --- | --- | --- |
| List pending | `src/api.js:PantheonApi.pendingCommits(site, env)` | source env = `test→dev`, else `→test`; `terminus:env:code-log <site>.<source>`; filters commits whose `labels` (comma list) include source but not target env |
| Route | `src/panel.js:handle` case `'pending'` | Returns `{ type: 'pending', env, commits }` |
| Deploy | `src/api.js:PantheonApi.deploy` | Not detailed here — see deploy case in `src/panel.js:handle`; pending list is re-fetched after deploy |
| Route `'deploy'` | `src/panel.js:handle` case `'deploy'` | Native confirm (modal, shows deploy note); on decline returns `{ type: 'deployCancelled', env }`; else deploys, shows info toast, re-fetches `pendingCommits` |
| Render | `media/main.js:renderPending` | Sets `pendingCounts[env]`, updates `${env}-badge` text to `"N pending"`, empty-state "Up to date with {source}" |
| UI fetch | `media/main.js:refreshPending(env)` | Called for `test` and `live` independently on `refreshAll` |

## Cross-Env Refresh After Workflows Settle

| Behaviour | Code location (file:function) | Notes |
| --- | --- | --- |
| Downstream map | `media/main.js` constant `DOWNSTREAM` | `{ dev: ['test','live'], test: ['live'], live: [] }` |
| Trigger | `media/main.js:refreshDownstream(key)` | Called after `commitDev`, `syncDev` (push), and `deployEnv` settle (success or failure) — re-runs `refreshPending` for every downstream env |
| Dev-only guard | `media/main.js:refreshDownstream` | Skips downstream refresh when `key === 'dev'` and `state.devEnv !== 'dev'` (a multidev commit has no downstream test/live) |

## Terminus/Git Command Shapes (generic, no values)

- `terminus env:diffstat <site>.<env>` — JSON
- `terminus env:commit <site>.<env> --message=<msg>`
- `terminus env:code-log <site>.<env>` — JSON, filtered client-side by `labels`
- `git fetch origin <branch>`
- `git log origin/<branch>..<branch> --date=iso-strict --format=%H%x1f%an%x1f%ad%x1f%s`
- `git push origin <branch>`

## Related

- `mem:feature/FEATURE_DASHBOARD`
- `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`
