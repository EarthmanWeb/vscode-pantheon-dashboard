---
name: Development Standards
description: Project overview, per-language conventions, and build/format/git commands. Index of DEV_* standards.
paths:
  - src/**/*.py
obligations:
  - <fill in: 1-2 imperative, concrete rules this memory imposes, or replace with "obligations: []" if none>
metadata:
  type: feature
---

# FEATURE_DEV_STANDARDS - Development Standards Index

## Project: vscode-pantheon-dashboard

**Primary Language:** JavaScript (plain, no build step, no TypeScript)

## Standards by Language

| Language   | Memory | Status                                   |
| ---------- | ------ | ----------------------------------------- |
| JavaScript | —      | Covered inline below; no separate DEV_* memory needed |

## General Standards

### Code Style

- Prettier: 2 spaces, single quotes, semicolons, no trailing commas
- No build step — plain JavaScript only, no TypeScript, no bundler
- Match existing file's naming/casing convention

### File Organization

| File           | Role                                                                 |
| -------------- | --------------------------------------------------------------------- |
| `extension.js` | Activation (auto-detects `pantheon.yml`/`pantheon.upstream.yml`), status bar |
| `src/shell.js` | Login-shell `execFile` runner — arg arrays only, never string interpolation |
| `src/api.js`   | `PantheonApi`: all terminus/git calls; every mutation polls `workflow:list` until workflows started since the operation are terminal |
| `src/panel.js` | Webview panel, message router                                        |
| `media/main.js`| Webview UI: request/response bridge keyed by `requestId`; spinners settle only when the host resolves |
| `media/main.css` | VS Code theme variables only — no hardcoded colors                  |

- New Terminus calls go in `src/api.js`; VS Code API stays in `src/panel.js` / `extension.js`; the webview never runs commands.

### Error Handling

- Fail fast: command stderr surfaces in the card UI; no fallbacks that mask failures
- No silent failures or empty catch blocks

### Security (PUBLIC REPO)

- No stored secrets, tokens, `.env` files, or site-specific identifiers (site names, orgs, ticket prefixes) in code, docs, memories, or git history
- Auth lives in the user's `~/.terminus` session only

### Testing

- See `FEATURE_TESTS` for test runner and patterns
- New functional code should have corresponding tests
- Follow existing test patterns in `tests/`

### Versioning

- Patch: `.githooks/pre-commit` bumps `package.json` patch version on every commit. NEVER bump the patch by hand. Installed by `npm install` / `npm test` (`prepare` script sets `core.hooksPath .githooks`).
- Major: bump manually (`npm version major --no-git-tag-version`) when a change may break existing behavior.
- Minor: bump manually (`npm version minor --no-git-tag-version`) when work reaches a suitable milestone.
- Hook skips the commit when the staged version already differs from HEAD (manual bump) and on `git commit --amend`.
- Commit prefix: `<type>: <change>` — no version suffix, never "Bump version to …" subjects (see `FEEDBACK_COMMIT_PREFIXES`)
