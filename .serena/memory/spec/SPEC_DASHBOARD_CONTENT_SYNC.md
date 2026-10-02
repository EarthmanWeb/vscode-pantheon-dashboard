---
name: SPEC_DASHBOARD_CONTENT_SYNC
description: TODO — one sentence describing what this memory is about.
metadata:
  type: spec
---

**SPEC_DASHBOARD_CONTENT_SYNC**

[new-memory-justified: task requires one spec/SPEC_DASHBOARD_<SLUG> coverage-map memory per feature file, distinct in type and purpose from the existing dom/DOM_DASHBOARD_CONTENT_SYNC behavior memory — this tracks Gherkin scenario -> test coverage status, not domain behavior]

---
name: Dashboard Content Sync Spec Coverage
description: Coverage map for the Sync Content (clone database/files) panel scenarios (tests/specs/dashboard-content-sync.feature).
metadata:
  type: spec
---

# SPEC_DASHBOARD_CONTENT_SYNC

## Spec File

| Property    | Value                                         |
| ----------- | ------------------------------------------------ |
| File        | `tests/specs/dashboard-content-sync.feature`    |
| Feature Key | DASHBOARD                                       |
| Created     | 2026-10-02                                      |
| Status      | implemented                                     |

## Coverage Map

| Scenario                                                | Steps                                                | Implemented | Tested | Test file                                     |
| ------------------------------------------------------------ | -------------------------------------------------------- | ----------- | ------ | ---------------------------------------------- |
| Sync icon on dev and test only                                 | dev/test have icon, live does not                         | Yes         | Yes    | `tests/webview.test.js`                        |
| Opening the panel                                               | panel slides down, "Sync from" options, unchecked, disabled | Yes       | Yes    | `tests/webview.test.js`                        |
| Sync button needs database or files (outline)                   | ticked state -> button enabled/disabled                   | Yes         | Yes    | `tests/webview.test.js`                        |
| Syncing runs the matching clone (outline)                       | cloneContent flags per ticked combo                        | Yes         | Yes    | `tests/api.test.js`, `tests/webview.test.js`   |
| Cancelling closes and resets the panel                          | cancel -> panel closes, boxes unchecked                    | Yes         | Yes    | `tests/webview.test.js`                        |
| Changing the dev environment closes the dev panel                | dev-env change -> dev sync panel closes                    | Yes         | Yes    | `tests/webview.test.js`                        |
| Sync with neither database nor files is rejected by the host     | cloneContent throws, no command run                        | Yes         | Yes    | `tests/api.test.js`                            |
| Sync failure is shown                                            | cloneContent rejects -> error on card                       | Yes         | Yes    | `tests/panel.test.js`, `tests/webview.test.js` |

## Linked Artifacts

- `src/api.js` (`PantheonApi.cloneContent`)
- `src/panel.js` (`syncContent` handler)
- `media/main.js` (`toggleSync`, `syncContent`, `syncButtons`)
- `tests/api.test.js` (`content-sync › *`), `tests/panel.test.js` (`content-sync › *`), `tests/webview.test.js` (`content-sync › *`)
- `mem:dom/DOM_DASHBOARD_CONTENT_SYNC` — domain behavior detail for this feature
