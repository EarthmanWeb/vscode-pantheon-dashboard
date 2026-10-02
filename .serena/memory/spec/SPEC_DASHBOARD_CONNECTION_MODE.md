---
name: SPEC_DASHBOARD_CONNECTION_MODE
description: TODO — one sentence describing what this memory is about.
metadata:
  type: spec
---

**SPEC_DASHBOARD_CONNECTION_MODE**

[new-memory-justified: task requires one spec/SPEC_DASHBOARD_<SLUG> coverage-map memory per feature file, distinct in type and purpose from the existing dom/DOM_DASHBOARD_* behavior memories — this tracks Gherkin scenario -> test coverage status, not domain behavior]

---
name: Dashboard Connection Mode Spec Coverage
description: Coverage map for SFTP/Git mode toggle and SFTP commit scenarios (tests/specs/dashboard-connection-mode.feature).
metadata:
  type: spec
---

# SPEC_DASHBOARD_CONNECTION_MODE

## Spec File

| Property    | Value                                          |
| ----------- | ------------------------------------------------ |
| File        | `tests/specs/dashboard-connection-mode.feature` |
| Feature Key | DASHBOARD                                       |
| Created     | 2026-10-02                                      |
| Status      | implemented                                     |

## Coverage Map

| Scenario                                                             | Steps                                                | Implemented | Tested | Test file                                  |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ----------- | ------ | --------------------------------------------- |
| Current mode is shown                                                  | devInfo -> badge/toggle/commit box                    | Yes         | Yes    | `tests/api.test.js`, `tests/webview.test.js` |
| Switching to SFTP mode needs no confirmation                           | setMode sftp, no confirm                              | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |
| Switching to Git with no uncommitted changes needs no confirmation     | setMode git, diffstat empty, no confirm               | Yes         | Yes    | `tests/panel.test.js`, `tests/webview.test.js` |
| Switching to Git with uncommitted changes asks inline                  | inline confirm text, mode unchanged, no spinner       | Yes         | Yes    | `tests/panel.test.js`, `tests/webview.test.js` |
| Confirming the Git switch discards changes                             | confirm -> setMode git                                | Yes         | Yes    | `tests/panel.test.js`, `tests/webview.test.js` |
| Cancelling the Git switch keeps SFTP mode                              | cancel -> mode unchanged                              | Yes         | Yes    | `tests/webview.test.js`                       |
| Uncommitted SFTP changes are listed                                    | diffstat -> file/status/additions/deletions           | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |
| Commit button requires a message                                       | empty message disables button                         | Yes         | Yes    | `tests/webview.test.js`                       |
| Committing SFTP changes                                                | commit -> wait -> diffstat reload, downstream reload  | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |
| Selecting a multidev retargets the dev card                            | dev selector -> reload for multidev                   | Yes         | Yes    | `tests/webview.test.js`                       |

## Linked Artifacts

- `src/api.js` (`PantheonApi.connectionMode`, `setMode`, `diffstat`, `commit`)
- `src/panel.js` (`setMode` handler: `confirmModeSwitch` response)
- `media/main.js` (`applyMode`, `switchMode`, `renderDiffstat`, `commitDev`)
- `tests/api.test.js` (`connection-mode › *`), `tests/panel.test.js` (`connection-mode › *`), `tests/webview.test.js` (`connection-mode › *`)
- `mem:dom/DOM_DASHBOARD_CONNECTION_MODE` — domain behavior detail for this feature
