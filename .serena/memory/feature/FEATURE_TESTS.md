---
name: Test Suite
description: Test runner, verification approach, and task-completion checklist for this project.
paths:
  - tests/**
obligations:
  - <fill in: 1-2 imperative, concrete rules this memory imposes, or replace with "obligations: []" if none>
metadata:
  type: feature
---

# FEATURE_TESTS - Test Suite

## Feature Overview

| Property      | Value          |
| ------------- | -------------- |
| **Name**      | Test Suite     |
| **Key**       | TESTS          |
| **Type**      | infrastructure |
| **Language**  | JavaScript     |
| **Framework** | node:test (built-in) + jsdom (webview UI tests) — stubbed runner, no Terminus needed |

## Running Tests

**ALWAYS use project scripts. All commands run from the project root.**

```bash
npm test          # node:test unit tests, stubbed runner — no Terminus needed
node --check …    # syntax check for a single file
```

### Test Gate

The test gate hook (`swe_pre_bash_test_gate.py`) **blocks** direct test runner
commands until this memory has been read in the current session.

**How it works:**

1. `swe_pre_bash_test_gate.py` intercepts Bash commands matching test patterns
2. Checks for sentinel file: `.serena/streams/.test_feature_{session_id}`
3. If missing -> **blocks** with instruction to read FEATURE_TESTS
4. When FEATURE_TESTS is read, `swe_post_read_state.py` calls
   `create_feature_sentinel(session_id, 'test')` which creates the sentinel
5. Subsequent test commands pass instantly (file existence check)

## Gherkin BDD Specs

Gherkin `.feature` files define testable behavioral specifications using Given/When/Then syntax.

| Property            | Value                          |
| ------------------- | ------------------------------ |
| **Specs Directory** | `tests/specs/`                 |
| **File Pattern**    | `[feature-key]-[slug].feature` |
| **Spec Authoring**  | `/swe-gherkin-spec [KEY]`      |
| **TDD from Spec**   | `/swe-gherkin-dev [slug]`      |

### Workflow Integration

- **New features**: Gherkin specs are prompted during `/swe-feature-onboard` and enforced at `WF_ARCH_REVIEW`
- **Feature additions**: `WF_VERIFY` checks if existing specs need new scenarios for changed behavior
- **Spec memories**: Each spec creates a `SPEC_[KEY]_[SLUG]` memory tracking coverage status

### Convention

- One `.feature` file per logical feature area
- Scenarios cover happy path, error cases, edge cases, and state transitions
- Each Given/When/Then step maps 1:1 to a test assertion
- No `test.fixme()` or `test.skip()` — 100% coverage required

## Scope Definition

### Primary Directories

| Directory       | Purpose                                              |
| --------------- | ------------------------------------------------------ |
| `tests/`        | Root of the test suite (node:test, `tests/*.test.js`) |
| `tests/helpers/`| Shared test harnesses (fake `vscode`, jsdom webview)  |
| `tests/specs/`  | Gherkin BDD specification files                       |

### Helpers

| File                              | Purpose                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `tests/helpers/vscode-stub.js`    | Fake `vscode` module (hooks `Module._load`/`_resolveFilename`) for `require('../src/panel')` in tests. Records `showWarningMessage`, `showInformationMessage`, `executeCommand`, `getConfiguration(section).get(key)`, `workspaceFolders`, `Uri.joinPath` calls. `install()`/`uninstall()`/`reset()`/`configure({ config, workspaceFolders })`/`getCalls()`. |
| `tests/helpers/webview.js`        | jsdom harness for `media/main.js`. `load()` returns `{ window, document, posted, tick, reply(msg, response), replyError(msg, message), waitFor(predicate, opts), nextRequest(type), consume(msg), setHidden(hidden), $, text, click, check, type }`. `boot(h, { email, site, sites, multidevs, devMode, diffstatFiles, unpushedBranch, unpushedCommits, pendingTest, pendingLive })` drives the init -> multidevs -> devInfo -> diffstat/unpushed -> pending(test/live) handshake to a loaded dashboard. Generic over message `type`s only — does not depend on confirm DOM ids, so it survives UI rewrites. |

## Test Runner Config

| Setting       | Value                                 |
| ------------- | -------------------------------------- |
| **Framework** | `node:test` (built-in `node --test`)  |
| **Root**      | `tests/`                                |

## Test Suites

| Suite              | File                   | Focus                                                                                                   |
| ------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| API / site match   | `tests/api.test.js`    | `PantheonApi` logic — test names prefixed `<spec slug> › <Scenario title>` matching `tests/specs/dashboard-*.feature`; stubbed, no live Terminus calls |
| Harness smoke test | `tests/harness.test.js`| Boots `tests/helpers/webview.js` against current `media/main.js` and asserts dev/test/live cards render — proves the harness works, not scenario coverage |
| Message router     | `tests/panel.test.js`  | `DashboardViewProvider.handle/route/html` with a fake recording `api` and stubbed `vscode` via `tests/helpers/vscode-stub.js`; asserts no `showWarningMessage` |
| Webview UI         | `tests/webview.test.js`| Webview UI behavior (inline confirms, payloads, poll, statuses) via `tests/helpers/webview.js` (jsdom) |

## Gotchas

- NEVER `assert.deepEqual` an object built inside `media/main.js` (jsdom realm) against a test-file literal — prototypes differ across realms and the assert fails. Compare fields individually.
- NEVER mutate `src/` or `media/` to prove a test can fail — mutate a copy in the OS tmp dir and load that.
