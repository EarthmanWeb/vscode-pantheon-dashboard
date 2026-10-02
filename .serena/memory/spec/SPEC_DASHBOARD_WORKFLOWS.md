---
name: SPEC_DASHBOARD_WORKFLOWS
description: TODO — one sentence describing what this memory is about.
metadata:
  type: spec
---

**SPEC_DASHBOARD_WORKFLOWS**

[new-memory-justified: task requires one spec/SPEC_DASHBOARD_<SLUG> coverage-map memory per feature file, distinct in type and purpose from the existing dom/DOM_DASHBOARD_WORKFLOW_POLLING behavior memory — this tracks Gherkin scenario -> test coverage status, not domain behavior]

---
name: Dashboard Workflows Spec Coverage
description: Coverage map for waitForEnv workflow-polling scenarios (tests/specs/dashboard-workflows.feature).
metadata:
  type: spec
---

# SPEC_DASHBOARD_WORKFLOWS

## Spec File

| Property    | Value                                      |
| ----------- | --------------------------------------------- |
| File        | `tests/specs/dashboard-workflows.feature`    |
| Feature Key | DASHBOARD                                     |
| Created     | 2026-10-02                                    |
| Status      | implemented                                   |

## Coverage Map

| Scenario                                                 | Steps                                          | Implemented | Tested | Test file               |
| --------------------------------------------------------- | -------------------------------------------------- | ----------- | ------ | -------------------------- |
| Waits until running workflows finish                         | polls 3x then resolves                             | Yes         | Yes    | `tests/api.test.js`      |
| A failed workflow fails the operation                         | throws "Pantheon workflow failed"                  | Yes         | Yes    | `tests/api.test.js`      |
| Workflows from before the operation are ignored                | since filter excludes old workflow                 | Yes         | Yes    | `tests/api.test.js`      |
| Pantheon housekeeping workflows are ignored                    | BACKGROUND_WORKFLOWS regex excludes index refresh  | Yes         | Yes    | `tests/api.test.js`      |
| Workflows on other environments are ignored                    | env filter                                         | Yes         | Yes    | `tests/api.test.js`      |
| Timing out reports the stuck workflows                         | throws "Timed out waiting for workflows on dev"    | Yes         | Yes    | `tests/api.test.js`      |
| Content clones get a 60 minute timeout                         | cloneContent calls waitForEnv with 3600000ms        | Yes         | Yes    | `tests/api.test.js`      |
| Errors reach the card that started the operation                | webview requestId-keyed error routing (webview-side) | Yes       | Yes    | `tests/webview.test.js`  |

## Linked Artifacts

- `src/api.js` (`PantheonApi.waitForEnv`, `BACKGROUND_WORKFLOWS`, `CLONE_TIMEOUT_MS`)
- `src/panel.js` (`route` error -> `postMessage({ type: 'error', requestId, message })`)
- `media/main.js` (request/response bridge keyed by requestId)
- `tests/api.test.js` (`workflows › *`), `tests/webview.test.js` (`workflows › Errors reach the card that started the operation`)
- `mem:dom/DOM_DASHBOARD_WORKFLOW_POLLING` — domain behavior detail for this feature
