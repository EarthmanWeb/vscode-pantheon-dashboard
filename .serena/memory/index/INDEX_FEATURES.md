---
name: Feature Index
description: Feature registry with relationships and types — navigation entry point for per-feature memories
metadata:
  type: index
obligations: []
---

# INDEX_FEATURES - Feature Registry

| Key   | Memory                        | Type           | Summary                                                    |
| ----- | ------------------------------ | -------------- | ----------------------------------------------------------- |
| DASHBOARD | `feature/FEATURE_DASHBOARD` | vscode_extension | Webview dashboard: activation, message protocol, PantheonApi, shell runner. Capabilities in `dom/DOM_DASHBOARD_*` (workflow polling, connection mode, commits, deploys, clear cache, content sync) |
| TESTS | `feature/FEATURE_TESTS`        | infrastructure | node:test suite (`tests/*.test.js`), run via `npm test`      |
| DEV   | `feature/FEATURE_DEV_STANDARDS`| infrastructure | Code style, file layout, error handling, security standards |

Register new features here when onboarded via `/swe-feature-onboard`.
