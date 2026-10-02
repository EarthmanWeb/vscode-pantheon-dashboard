---
name: Pantheon Dashboard
description: Feature overview for the VS Code Pantheon Terminus dashboard — architecture layers, activation, message protocol, key files.
metadata:
  type: feature
obligations:
  - New Terminus calls go in `src/api.js`; VS Code API stays in `src/panel.js` / `extension.js`; the webview NEVER runs commands.
  - Every `PantheonApi` mutation MUST poll `workflow:list` via `waitForEnv` until workflows started since the operation are terminal before resolving.
---

[new-memory-justified: orchestrator-specified new feature memory for the dashboard feature itself; index/INDEX_FEATURES is a navigation index and feature/FEATURE_DEV_STANDARDS is project-wide style/security standards — neither documents DASHBOARD's architecture, message protocol, or key symbols]

# FEATURE_DASHBOARD - Pantheon Dashboard

## Feature Overview

| Property      | Value                       |
| ------------- | ---------------------------- |
| **Name**      | Pantheon Dashboard           |
| **Key**       | DASHBOARD                   |
| **Type**      | vscode_extension             |
| **Language**  | javascript (plain, no build step, no TypeScript) |
| **Framework** | VS Code extension API (webview view provider)    |

## Scope Definition / Primary Directories

| Path            | Purpose                                                        |
| ---------------- | --------------------------------------------------------------- |
| `extension.js`   | Activation entry point, status bar item                       |
| `src/`           | Extension-host logic: shell runner, Terminus/git API, webview panel/router |
| `media/`         | Webview UI assets served into the panel (JS, CSS, icons)       |
| `tests/`         | node:test unit tests + Gherkin specs (`tests/specs/`)          |
| `package.json`   | Manifest: activation events, contributed view/command/config    |

## Architecture Layers

```
media/main.js (webview)
   | postMessage({ type, requestId, ...payload })
   v
src/panel.js  DashboardViewProvider.route/handle  (message router)
   | calls PantheonApi methods
   v
src/api.js    PantheonApi  (terminus/git command builders, waitForEnv polling)
   | this.run(bin, args, cwd)
   v
src/shell.js  run(bin, args, cwd)  (login-shell execFile, arg arrays only)
   | execFile($SHELL, ['-lc', 'exec "$0" "$@"', bin, ...args])
   v
terminus / git CLIs
```

Responses flow back host -> webview tagged with the same `requestId`; errors become `{ type: 'error', requestId, message }`.

Destructive confirms (mode-switch discard, clear-cache, content sync, push, deploy) are now INLINE in the webview (`media/main.js:openConfirm`/`closeConfirm`, one `#<key>-confirm` slide-down panel per card) — `src/panel.js` has NO native confirm dialogs (`vscode.window.showWarningMessage`) and NO `*Cancelled` response types. Cancel in the webview simply never sends the request.

## Activation

- `extension.js` `isPantheonWorkspace()`: true if any workspace folder root contains `pantheon.yml` or `pantheon.upstream.yml`.
- `activationEvents` in `package.json`: `workspaceContains:pantheon.yml`, `workspaceContains:pantheon.upstream.yml` (zero-config gating; unloaded elsewhere).
- Sets context key `pantheonDashboard.enabled` via `setContext`; the contributed view's `when` clause gates on it.
- Registers `DashboardViewProvider` for view id `pantheonDashboard.view` (container `pantheonDashboard`, Activity Bar icon `media/icon.svg`).
- Registers command `pantheonDashboard.open` -> focuses the view.
- Creates a left-aligned status bar item (`$(cloud) Pantheon`) that runs `pantheonDashboard.open`.
- Setting KEY `pantheonDashboard.site` (string, default empty): explicit site machine name; empty means resolve by matching the workspace folder name against `terminus site:list` (`matchSite` in `src/api.js`). Resolution happens in `DashboardViewProvider.resolveSite()`.

## Message Protocol

| webview `type`  | `PantheonApi` method(s) called               | Response `type`                  | Notes |
| --------------- | --------------------------------------------- | --------------------------------- | ----- |
| `reload`        | none                                          | (no response — triggers window reload) | Handled before `handle()`, bypasses try/catch |
| `init`          | `whoami`, `listSites`, `matchSite` (via `resolveSite`) | `loggedOut` or `init` (email, site, sites) | Auth-failure regex routes to `loggedOut` |
| `multidevs`     | `listMultidevs`                              | `multidevs` (envs)                |       |
| `devInfo`       | `connectionMode`                             | `devInfo` (mode)                  |       |
| `setMode`       | `diffstat` (git-mode guard) + `setMode` + `connectionMode` | `confirmModeSwitch` (count) or `devInfo` (mode) | Returns `confirmModeSwitch` when switching dev to git with non-empty diffstat and `!msg.confirmed`; webview opens its inline confirm and resends with `confirmed: true` |
| `diffstat`      | `diffstat`                                   | `diffstat` (files)                |       |
| `commit`        | `commit` + `diffstat`                        | `diffstat` (files)                |       |
| `unpushed`      | `unpushedCommits`                            | `unpushed` (branch, commits)      |       |
| `syncContent`   | `cloneContent`                               | `contentSynced`                   | Webview gates this behind its own inline confirm BEFORE sending; `src/panel.js` has no server-side confirm or target-env restriction (see `mem:dom/DOM_DASHBOARD_CONTENT_SYNC`) |
| `clearCache`    | `clearCache`                                 | `cacheCleared`                    | Webview gates this behind its own inline confirm BEFORE sending |
| `push`          | `push` + (`cloneContent` or `clearCache`, optional) + `unpushedCommits` | `unpushed` (branch, commits) | Webview gates this behind its own inline confirm BEFORE sending; `cloneContent` runs when `msg.sync` set, else `clearCache` when `msg.cc` set |
| `pending`       | `pendingCommits`                             | `pending` (env, commits)          |       |
| `deploy`        | `deploy` + (`cloneContent`, optional) + `pendingCommits` | `pending` (env, commits)  | Webview gates this behind its own inline confirm BEFORE sending; `cc: msg.cc && !msg.sync` passed to `deploy()`; `cc` rides the trailing `cloneContent` call instead when `msg.sync` is set |

- Error propagation: any thrown error in `handle()` is caught by `route()` and posted as `{ type: 'error', requestId, message: err.message }`; the webview bridge rejects the pending request promise, and callers render it with `fail()` into the card's status area.

## Key Files

| File             | Purpose / key symbols                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| `extension.js`   | `activate`, `isPantheonWorkspace`                                            |
| `src/shell.js`   | `run(bin, args, cwd)` — login-shell `execFile` wrapper                       |
| `src/api.js`     | `PantheonApi` (constructor, `terminus`, `terminusJson`, `git`, `whoami`, `listSites`, `listMultidevs`, `connectionMode`, `setMode`, `diffstat`, `commit`, `unpushedCommits`, `pendingCommits`, `deploy`, `clearCache`, `cloneContent`, `push`, `waitForEnv`); `matchSite` |
| `src/panel.js`   | `DashboardViewProvider` (`resolveWebviewView`, `route`, `handle`, `resolveSite`, `html`), `workspaceRoot` |
| `media/main.js`  | `request`/`inflight` map (requestId bridge), `skeleton`, `refreshAll`, `refreshDev`, `refreshEnvs`, `refreshPending`, `refreshDownstream`, `openConfirm`/`closeConfirm`/`confirmFieldsHtml` (inline confirm panel), action handlers (`switchMode`/`requestSetMode`, `clearCache`, `syncContent`/`toggleSyncConfirm`, `syncDev`, `commitDev`, `deployEnv`), `init` |
| `media/main.css` | VS Code theme-variable-only styling, no hardcoded colors                     |
| `package.json`   | `contributes` (commands, viewsContainers, views, configuration), `activationEvents` |

## Related Memories

| Memory                                     | Relation                                              |
| ------------------------------------------- | ------------------------------------------------------ |
| `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING`    | `waitForEnv` polling contract, downstream list refresh |
| `mem:dom/DOM_DASHBOARD_CONNECTION_MODE`     | dev env SFTP/git mode toggle behavior                 |
| `mem:dom/DOM_DASHBOARD_COMMITS`             | SFTP commit + git push/unpushed-commit flows          |
| `mem:dom/DOM_DASHBOARD_DEPLOYS`             | pending-commit and deploy flow (dev->test->live)       |
| `mem:dom/DOM_DASHBOARD_CLEAR_CACHE`         | clear-cache inline confirm + wait flow                |
| `mem:dom/DOM_DASHBOARD_CONTENT_SYNC`        | `cloneContent` db/files/cc sync flow                  |
| `mem:feature/FEATURE_TESTS`                 | test runner, Gherkin spec conventions                 |
| `mem:feature/FEATURE_DEV_STANDARDS`         | style, security, versioning, commit-prefix standards  |
| `mem:spec/SPEC_DASHBOARD_SESSION`           | init/login/site-resolution spec                       |
| `mem:spec/SPEC_DASHBOARD_CONNECTION_MODE`   | mode-toggle spec                                      |
| `mem:spec/SPEC_DASHBOARD_LOCAL_COMMITS`     | diffstat/commit/push spec                             |
| `mem:spec/SPEC_DASHBOARD_DEPLOY`            | deploy spec                                           |
| `mem:spec/SPEC_DASHBOARD_CLEAR_CACHES`      | clear-cache spec                                      |
| `mem:spec/SPEC_DASHBOARD_CONTENT_SYNC`      | content-sync spec                                     |
| `mem:spec/SPEC_DASHBOARD_WORKFLOWS`         | workflow-polling spec                                 |

## Testing

| Suite              | File                 | Command    | Approach                                        |
| ------------------- | -------------------- | ---------- | ------------------------------------------------ |
| API / site match    | `tests/api.test.js`  | `npm test` | node:test, stubbed `run` injected via `options.run` — no live Terminus/git calls |
