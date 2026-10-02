---
name: SPEC_DASHBOARD_DEPLOY
description: TODO — one sentence describing what this memory is about.
metadata:
  type: spec
---

**SPEC_DASHBOARD_DEPLOY**

[new-memory-justified: task requires one spec/SPEC_DASHBOARD_<SLUG> coverage-map memory per feature file, distinct in type and purpose from the existing dom/DOM_DASHBOARD_DEPLOYS behavior memory — this tracks Gherkin scenario -> test coverage status, not domain behavior]

---
name: Dashboard Deploy Spec Coverage
description: Coverage map for Test/Live deploy and pending-commit scenarios (tests/specs/dashboard-deploy.feature).
metadata:
  type: spec
---

# SPEC_DASHBOARD_DEPLOY

## Spec File

| Property    | Value                                  |
| ----------- | ----------------------------------------- |
| File        | `tests/specs/dashboard-deploy.feature`   |
| Feature Key | DASHBOARD                                 |
| Created     | 2026-10-02                                |
| Status      | implemented                               |

## Coverage Map

| Scenario                                                | Steps                                                  | Implemented | Tested | Test file                                     |
| ------------------------------------------------------------ | --------------------------------------------------------- | ----------- | ------ | ---------------------------------------------- |
| Pending commits for an environment (outline)                   | pendingCommits label filtering, test/live                 | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`     |
| Up-to-date environment                                          | 0 pending -> "Up to date with dev" + badge "0 pending"     | Yes         | Yes    | `tests/webview.test.js`                        |
| Deploy button requires a note and pending commits               | empty note/0 pending disables button                       | Yes         | Yes    | `tests/webview.test.js`                        |
| Test deploy asks inline with sync options                       | inline confirm w/ sync options, no spinner                | Yes         | Yes    | `tests/webview.test.js`                        |
| Live deploy asks inline with clear caches only                  | inline confirm, cc only, no sync options                  | Yes         | Yes    | `tests/webview.test.js`                        |
| Cancelling a deploy                                             | cancel -> nothing deployed, note kept                      | Yes         | Yes    | `tests/webview.test.js`                        |
| Deploy only                                                     | deploy w/o cc -> wait -> note cleared, live reloads         | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |
| Deploy with clear caches only                                   | `api.deploy(site, env, note, { cc: true })` adds `--cc`     | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |
| Test deploy then sync database and files                        | deploy then cloneContent from source                        | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |
| Deploy failure still reloads downstream lists                   | deploy fails -> error shown, live pending still reloads     | Yes         | Yes    | `tests/panel.test.js`, `tests/webview.test.js` |

## Linked Artifacts

- `src/api.js` (`PantheonApi.pendingCommits`, `deploy`, `cloneContent`)
- `src/panel.js` (`pending`, `deploy` handlers)
- `media/main.js` (`renderPending`, `deployEnv`, `refreshDownstream`)
- `tests/api.test.js` (`deploy › *`), `tests/panel.test.js` (`deploy › *`), `tests/webview.test.js` (`deploy › *`)
- `mem:dom/DOM_DASHBOARD_DEPLOYS` — domain behavior detail for this feature

## Notes

`api.deploy(site, env, note, { cc })` implements the `--cc` flag (`src/api.js`).
