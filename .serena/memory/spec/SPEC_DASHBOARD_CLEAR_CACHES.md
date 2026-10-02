---
name: SPEC_DASHBOARD_CLEAR_CACHES
description: TODO — one sentence describing what this memory is about.
metadata:
  type: spec
---

**SPEC_DASHBOARD_CLEAR_CACHES**

[new-memory-justified: task requires one spec/SPEC_DASHBOARD_<SLUG> coverage-map memory per feature file, distinct in type and purpose from the existing dom/DOM_DASHBOARD_CLEAR_CACHE behavior memory — this tracks Gherkin scenario -> test coverage status, not domain behavior]

---
name: Dashboard Clear Caches Spec Coverage
description: Coverage map for the per-card Clear Caches confirm-and-run flow (tests/specs/dashboard-clear-caches.feature).
metadata:
  type: spec
---

# SPEC_DASHBOARD_CLEAR_CACHES

## Spec File

| Property    | Value                                         |
| ----------- | ------------------------------------------------ |
| File        | `tests/specs/dashboard-clear-caches.feature`    |
| Feature Key | DASHBOARD                                       |
| Created     | 2026-10-02                                      |
| Status      | implemented                                     |

## Coverage Map

| Scenario                                            | Steps                                             | Implemented | Tested | Test file                                     |
| -------------------------------------------------------- | ---------------------------------------------------- | ----------- | ------ | ---------------------------------------------- |
| Clear caches asks inline (outline: dev/test/live)           | inline confirm text, no spinner/status               | Yes         | Yes    | `tests/webview.test.js`                        |
| The dev card targets the selected multidev                  | confirm text uses selected multidev env              | Yes         | Yes    | `tests/webview.test.js`                        |
| Confirming clears caches                                     | confirm -> spinner -> clearCache -> wait -> status    | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |
| Cancelling leaves the card unchanged                         | cancel -> no call, no spinner/status                  | Yes         | Yes    | `tests/webview.test.js`                        |
| Clear caches failure is shown                                | clearCache rejects -> error surfaced                  | Yes         | Yes    | `tests/panel.test.js`, `tests/webview.test.js` |

## Linked Artifacts

- `src/api.js` (`PantheonApi.clearCache`)
- `src/panel.js` (`clearCache` handler)
- `media/main.js` (`clearCache` action, inline confirm UI)
- `tests/api.test.js` (`api › clearCache clears the env then waits for workflows`), `tests/panel.test.js` (`clear-caches › *`), `tests/webview.test.js` (`clear-caches › *`)
- `mem:dom/DOM_DASHBOARD_CLEAR_CACHE` — domain behavior detail for this feature
