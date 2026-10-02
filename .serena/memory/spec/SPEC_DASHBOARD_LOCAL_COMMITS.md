---
name: SPEC_DASHBOARD_LOCAL_COMMITS
description: TODO — one sentence describing what this memory is about.
metadata:
  type: spec
---

**SPEC_DASHBOARD_LOCAL_COMMITS**

[new-memory-justified: task requires one spec/SPEC_DASHBOARD_<SLUG> coverage-map memory per feature file, distinct in type and purpose from the existing dom/DOM_DASHBOARD_COMMITS behavior memory — this tracks Gherkin scenario -> test coverage status, not domain behavior]

---
name: Dashboard Local Commits Spec Coverage
description: Coverage map for unpushed local commits and push scenarios (tests/specs/dashboard-local-commits.feature).
metadata:
  type: spec
---

# SPEC_DASHBOARD_LOCAL_COMMITS

## Spec File

| Property    | Value                                         |
| ----------- | ------------------------------------------------ |
| File        | `tests/specs/dashboard-local-commits.feature`   |
| Feature Key | DASHBOARD                                       |
| Created     | 2026-10-02                                      |
| Status      | implemented                                     |

## Coverage Map

| Scenario                                                   | Steps                                         | Implemented | Tested | Test file                                     |
| -------------------------------------------------------------- | ------------------------------------------------ | ----------- | ------ | ---------------------------------------------- |
| Unpushed commits are listed with simplified wording             | unpushedCommits -> status/list/button enabled    | Yes         | Yes    | `tests/api.test.js`, `tests/webview.test.js`   |
| Clean branch shows the matching state                            | 0 commits -> "matches origin" + disabled button  | Yes         | Yes    | `tests/webview.test.js`                        |
| A multidev compares its own branch                               | origin/themes..themes range                      | Yes         | Yes    | `tests/api.test.js`, `tests/webview.test.js`   |
| Refresh fetches origin first                                     | fetch before log                                 | Yes         | Yes    | `tests/api.test.js`, `tests/webview.test.js`   |
| Background check finds a new local commit without fetching       | fetch:false poll                                 | Yes         | Yes    | `tests/api.test.js`, `tests/webview.test.js`   |
| Background check leaves an unchanged list alone                  | sig unchanged -> no re-render                    | Yes         | Yes    | `tests/webview.test.js`                        |
| Background check pauses (outline: SFTP/busy/hidden)              | no request sent when paused                      | Yes         | Yes    | `tests/webview.test.js`                        |
| Push asks inline before running                                  | inline confirm w/ sync options, no spinner        | Yes         | Yes    | `tests/webview.test.js`                        |
| Push source list excludes the target                             | "Sync from" excludes target env                  | Yes         | Yes    | `tests/webview.test.js`                        |
| Cancelling the push                                               | cancel -> nothing pushed                         | Yes         | Yes    | `tests/webview.test.js`                        |
| Push only                                                         | push -> wait -> reload test/live pending          | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |
| Push then sync database and clear caches                         | push then cloneContent w/ cc                      | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |
| Push then clear caches only                                       | push then clearCache                              | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |
| Push failure is shown in the card                                 | git push rejects -> error surfaced                | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |

## Linked Artifacts

- `src/api.js` (`PantheonApi.unpushedCommits`, `push`, `cloneContent`, `clearCache`)
- `src/panel.js` (`unpushed`, `push` handlers)
- `media/main.js` (`renderUnpushed`, `pollUnpushed`, `syncDev`)
- `tests/api.test.js` (`local-commits › *`), `tests/panel.test.js` (`local-commits › *`), `tests/webview.test.js` (`local-commits › *`)
- `mem:dom/DOM_DASHBOARD_COMMITS` — domain behavior detail for this feature
