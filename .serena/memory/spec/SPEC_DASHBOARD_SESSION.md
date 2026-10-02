---
name: SPEC_DASHBOARD_SESSION
description: TODO — one sentence describing what this memory is about.
metadata:
  type: spec
---

**SPEC_DASHBOARD_SESSION**

[new-memory-justified: scenario-coverage tracking for tests/specs/dashboard-session.feature; distinct from dom/feature memories]

---
name: Dashboard Session Spec Coverage
description: Coverage map for Terminus login gate, site resolution and multidev environment listing scenarios (tests/specs/dashboard-session.feature).
metadata:
  type: spec
---

# SPEC_DASHBOARD_SESSION

## Spec File

| Property    | Value                                      |
| ----------- | --------------------------------------------- |
| File        | `tests/specs/dashboard-session.feature`      |
| Feature Key | DASHBOARD                                     |
| Created     | 2026-10-02                                    |
| Status      | implemented                                   |

## Coverage Map

| Scenario                                                     | Steps                                             | Implemented | Tested | Test file                                     |
| -------------------------------------------------------------- | ----------------------------------------------------- | ----------- | ------ | ---------------------------------------------- |
| Logged-out user sees the login gate                              | whoami auth failure -> login message, docs link, reload button | Yes | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |
| Reload button asks the host to reload the window                 | click Reload VS Code -> reload-window command          | Yes         | Yes    | `tests/panel.test.js`, `tests/webview.test.js` |
| Configured site setting wins over folder matching                | `pantheonDashboard.site` setting -> selected site       | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`     |
| Site resolved from the workspace folder name (outline)           | sites list + folder name -> matched/none site           | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`     |
| No resolvable site prompts for selection                         | no site resolved -> "Select a site above." on every card | Yes       | Yes    | `tests/webview.test.js`                        |
| Switching site refreshes every card                              | select other site -> dev/test/live reload              | Yes         | Yes    | `tests/webview.test.js`                        |
| Multidev environments populate the dev selector                  | multidevs -> selector lists dev/alpha/themes in order   | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |
| Terminus failure during init is shown                            | whoami non-auth error -> error surfaced                | Yes         | Yes    | `tests/api.test.js`, `tests/panel.test.js`, `tests/webview.test.js` |

## Linked Artifacts

- `extension.js` (`isPantheonWorkspace`)
- `src/api.js` (`PantheonApi.whoami`, `listSites`, `listMultidevs`, `matchSite`)
- `src/panel.js` (`DashboardViewProvider.resolveSite`, `init`/`multidevs` handlers)
- `media/main.js` (`init`, `refreshAll`, site/dev selectors)
- `tests/api.test.js` (`session › *`), `tests/panel.test.js` (`session › *`), `tests/webview.test.js` (`session › *`)
- `mem:feature/FEATURE_DASHBOARD` — architecture and activation detail for this feature
