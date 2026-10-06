---
name: Dashboard Commits, Push, and Pending Deploys
description: SFTP diffstat/commit (dev), unpushed-commit push flow (dev git mode), and pending-commit list for test/live.
metadata:
  type: domain
obligations:
  - Gate `push` behind the inline confirm panel (`openConfirm`) in the webview before sending the request — `src/panel.js` has no server-side confirm for push.
  - Pass `fetch: false` from the background poll (`pollUnpushed`) to avoid a network call on every poll tick.
---

[new-memory-justified: task assigned by orchestrator to create this domain memory covering commit/push/pending-deploy mechanics; feature/FEATURE_DASHBOARD is the parent feature memory being written in parallel by another agent and index/INDEX_FEATURES is a navigation index, neither duplicates this code-location reference]

# Dashboard Commits, Push, and Pending Deploys

## SFTP Diffstat + Commit (dev env only, SFTP mode)

| Behaviour | Code location (file:function) | Notes |
| --- | --- | --- |
| List uncommitted server files | `src/api.js:PantheonApi.diffstat` | `terminus env:diffstat <site>.<env>` JSON; normalizes object-shaped response into `{file, status, additions, deletions}[]` |
| Commit server changes | `src/api.js:PantheonApi.commit` | `terminus env:commit <site>.<env> --message=<msg>`, then `waitForEnv`; returns nothing — caller re-fetches diffstat |
| Route `'diffstat'` | `src/panel.js:handle` case `'diffstat'` | Returns `{ type: 'diffstat', files }` |
| Route `'commit'` | `src/panel.js:handle` case `'commit'` | Calls `api.commit` then `api.diffstat`, returns `{ type: 'diffstat', files }` (reuses diffstat shape) |
| Render | `media/main.js:renderDiffstat` | Empty-state message when no files; else table with +additions/-deletions per file |
| Commit UI | `media/main.js:commitDev` | Reads `#dev-message`, posts `'commit'`, status text `Committing on ${env}…` (no "waiting for Pantheon" wording), clears textarea, re-renders diffstat, calls `refreshDownstream('dev')` |

## Unpushed Local Commits (dev env only, Git mode)

| Behaviour | Code location (file:function) | Notes |
| --- | --- | --- |
| List unpushed | `src/api.js:PantheonApi.unpushedCommits(branch, {fetch})` | Optional `git fetch origin <branch>`, then `git log origin/<branch>..<branch> --format=%H%x1f%an%x1f%ad%x1f%s` (unit-separator-delimited: hash/author/datetime/message); the log runs through `logCommits` |
| Branch mapping | `src/panel.js:handle` case `'unpushed'` | `branch = env === 'dev' ? 'master' : env` — dev maps to `master`, multidevs use their own branch name |
| Route | `src/panel.js:handle` case `'unpushed'` | Returns `{ type: 'unpushed', branch, commits }`; `msg.fetch` passed straight through to `unpushedCommits` |
| Render | `media/main.js:renderUnpushed` | Sets `state.unpushedCount`/`state.unpushedSig` (hash-joined signature); shows "Sync to {label}" button when commits exist |
| Background poll | `media/main.js:pollUnpushed` | Every `LOCAL_POLL_MS` (5000ms) when dev card is in Git mode, idle, and tab visible; sends `unpushed` with `fetch: false` (no network call) — only re-renders if signature changed |
| Push | `src/api.js:PantheonApi.push(site, env, branch)` | `git push origin <branch>`, then `waitForEnv` |
| Inline confirm before push | `media/main.js:syncDev` -> `openConfirm('dev', {...})` | Message: `Push ${count} commit(s) to origin/${branch}? This deploys to ${env}.`; `sync: true`, `cc: true`, `yesLabel: 'Push'` — gates the request client-side; Cancel resolves `null`, no request sent |
| Push route | `src/panel.js:handle` case `'push'` | NO server-side confirm (no `vscode.window.showWarningMessage`); calls `api.push(site, env, branch)` unconditionally, then: if `msg.sync` set, calls `api.cloneContent(site, msg.sync.from, msg.env, {db, files, cc: msg.cc})`; else if `msg.cc` set, calls `api.clearCache(site, msg.env)`; returns `{ type: 'unpushed', branch, commits: await api.unpushedCommits(branch) }` |
| Push UI | `media/main.js:syncDev` | Posts `{type:'push', site, env, branch, count, cc, sync}` after confirm resolves; `sync` is `{from, db, files}` when Database or Files checked, else `null`; on success re-renders unpushed list, calls `refreshDownstream('dev')` |

## Pending Commits (test/live envs — read from local git, deploy source)

Why git: Terminus 4.1.1 `env:code-log --format=json` truncates every commit message to 50 chars; local git subjects are complete. No Terminus call, no fallback; errors reject and show in the card.

| Behaviour | Code location (file:function) | Notes |
| --- | --- | --- |
| List pending | `src/api.js:PantheonApi.pendingCommits(site, env)` | `site` unused. test = `<latest pantheon_test tag>..<remote>/master`; live = `<latest pantheon_live tag>..<latest pantheon_test tag>`. Returns `{hash, author, datetime, message}[]` via `logCommits` |
| Find Pantheon remote | `src/api.js:PantheonApi.pantheonRemote` | Parses `git remote -v`; first remote whose URL matches `ssh://[<user>@]codeserver.dev.<site-id>.drush.in:2222/~/repository.git`. Matches by URL, never by name. No match -> Error "No Pantheon git remote (ssh://codeserver.dev.<site-id>@codeserver.dev.<site-id>.drush.in:2222/~/repository.git) in this workspace" |
| Fetch | `src/api.js:PantheonApi.fetchPantheon` | `git fetch <remote> master --tags`; in-flight promise `this.pantheonFetch` shared so concurrent Test and Live refreshes run one fetch; cleared on settle |
| Latest deploy tag | `src/api.js:PantheonApi.latestDeployTag(env)` | `git tag -l pantheon_<env>_* --sort=-v:refname`, first line (numeric order; lexical would put 999 above 1000). No tag -> Error "No pantheon_<env>_* deploy tag in this repository" |
| Git log | `src/api.js:PantheonApi.logCommits(range)` | `git log <range> --date=iso-strict --format=%H%x1f%an%x1f%ad%x1f%s` -> `{hash, author, datetime, message}`; shared with `unpushedCommits` |
| Route | `src/panel.js:handle` case `'pending'` | Returns `{ type: 'pending', env, commits }` |
| Deploy | `src/api.js:PantheonApi.deploy` | See `mem:dom/DOM_DASHBOARD_DEPLOYS` for full deploy + inline-confirm flow |
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
- `git remote -v`
- `git fetch <pantheon-remote> master --tags`
- `git tag -l pantheon_<env>_* --sort=-v:refname`
- `git log <testTag>..<remote>/master`
- `git log <liveTag>..<testTag>`
- `git fetch origin <branch>`
- `git log origin/<branch>..<branch> --date=iso-strict --format=%H%x1f%an%x1f%ad%x1f%s`
- `git push origin <branch>`

## Related

- `mem:feature/FEATURE_DASHBOARD`
- `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`
- `mem:dom/DOM_DASHBOARD_DEPLOYS`
- `mem:spec/SPEC_DASHBOARD_LOCAL_COMMITS`
